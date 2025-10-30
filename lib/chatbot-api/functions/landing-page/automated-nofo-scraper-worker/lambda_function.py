"""
Automated NOFO Scraper Worker Lambda Function

This function processes SQS messages containing NOFO opportunity details.
It downloads attachments, extracts zip files if needed, identifies NOFO files using Bedrock,
and uploads them to S3 for processing by the existing pipeline.
"""

import os
import json
import zipfile
import io
import boto3
from botocore.exceptions import ClientError
import urllib.request

S3_BUCKET = os.environ.get('BUCKET')
CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0'

# Initialize AWS clients
s3_client = boto3.client('s3', region_name='us-east-1')
bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')


def download_file(url):
    """
    Downloads a file from a URL and returns it as bytes
    """
    try:
        with urllib.request.urlopen(url) as response:
            if response.status != 200:
                raise Exception(f'Download failed with status {response.status}: {response.reason}')
            return response.read()
    except Exception as error:
        print(f'Error downloading file from {url}: {str(error)}')
        raise


def extract_zip(zip_buffer):
    """
    Extracts a zip file and returns a list of { name, data } dictionaries
    """
    try:
        zip_file = zipfile.ZipFile(io.BytesIO(zip_buffer))
        extracted_files = []
        
        for entry_name in zip_file.namelist():
            # Skip directories
            if not entry_name.endswith('/'):
                extracted_files.append({
                    'name': entry_name,
                    'data': zip_file.read(entry_name)
                })
        
        return extracted_files
    except Exception as error:
        print(f'Error extracting zip file: {str(error)}')
        raise


def identify_nofo_file(file_names, bedrock_client):
    """
    Uses Bedrock to identify which file is the NOFO document from a list of file names
    """
    try:
        prompt = f"""Given a list of file names from a grant opportunity package, identify which file is the Notice of Funding Opportunity (NOFO) document. 
NOFO files typically contain terms like: NOFO, Notice, Funding Opportunity, FO, RFA, RFP, Funding Opportunity Announcement, etc.
They are usually PDF files but can also be Word documents or text files.

File names:
{chr(10).join([f"{idx + 1}. {name}" for idx, name in enumerate(file_names)])}

Return ONLY a JSON object with this exact format:
{{"nofoFileName": "filename.pdf"}}

If none of the files appear to be a NOFO document, return the first PDF file. If no PDF files exist, return the first file in the list."""

        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 500,
            "temperature": 0
        }

        response = bedrock_client.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            contentType='application/json',
            accept='application/json',
            body=json.dumps(request_body)
        )

        response_body = json.loads(response['body'].read())
        completion_text = response_body['content'][0]['text']

        # Extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', completion_text)
        if json_match:
            result = json.loads(json_match.group(0))
            return result.get('nofoFileName')

        # Fallback: return first PDF or first file
        pdf_file = next((name for name in file_names if name.lower().endswith('.pdf')), None)
        return pdf_file or file_names[0] if file_names else None

    except Exception as error:
        print(f'Error identifying NOFO file with Bedrock: {str(error)}')
        # Fallback: return first PDF or first file
        pdf_file = next((name for name in file_names if name.lower().endswith('.pdf')), None)
        return pdf_file or file_names[0] if file_names else None


def upload_to_s3(key, file_buffer, content_type, s3_client):
    """
    Uploads a file to S3
    """
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=file_buffer,
            ContentType=content_type
        )
        print(f'Successfully uploaded to S3: {key}')
    except Exception as error:
        print(f'Error uploading to S3: {key} - {str(error)}')
        raise


def get_file_info(file_name):
    """
    Determines content type and file name based on file extension
    """
    extension = file_name.split('.')[-1].lower() if '.' in file_name else ''
    
    content_type = 'application/octet-stream'
    s3_file_name = 'NOFO-File-PDF'
    
    if extension == 'pdf':
        content_type = 'application/pdf'
        s3_file_name = 'NOFO-File-PDF'
    elif extension in ['txt', 'text']:
        content_type = 'text/plain'
        s3_file_name = 'NOFO-File-TXT'
    elif extension in ['doc', 'docx']:
        content_type = 'application/msword'
        s3_file_name = 'NOFO-File-DOC'
    
    return {'content_type': content_type, 's3_file_name': s3_file_name}


def process_attachment(attachment, opportunity_title, bedrock_client, s3_client):
    """
    Processes a single attachment
    """
    try:
        download_url = attachment['download_path']
        print(f'Processing attachment: {download_url}')
        
        # Download the file
        file_buffer = download_file(download_url)
        
        # Check if it's a zip file
        url_parts = download_url.split('.')
        extension = url_parts[-1].lower() if url_parts else ''
        
        if extension == 'zip':
            # Extract zip file
            print('Extracting zip file...')
            extracted_files = extract_zip(file_buffer)
            
            if len(extracted_files) == 0:
                raise Exception('Zip file is empty or contains no files')
            
            # Get list of file names for Bedrock identification
            file_names = [f['name'] for f in extracted_files]
            print(f'Extracted {len(file_names)} files from zip: {file_names}')
            
            # Use Bedrock to identify the NOFO file
            nofo_file_name = identify_nofo_file(file_names, bedrock_client)
            print(f'Bedrock identified NOFO file: {nofo_file_name}')
            
            # Find the identified file in extracted files
            nofo_file = next((f for f in extracted_files if f['name'] == nofo_file_name), None)
            if not nofo_file:
                raise Exception(f'Identified NOFO file "{nofo_file_name}" not found in zip')
            
            # Get file info and upload
            file_info = get_file_info(nofo_file_name)
            s3_key = f'{opportunity_title}/{file_info["s3_file_name"]}'
            upload_to_s3(s3_key, nofo_file['data'], file_info['content_type'], s3_client)
            
            return {'success': True, 'file_name': nofo_file_name, 'source': 'zip'}
        else:
            # Direct file upload (PDF, TXT, etc.)
            file_info = get_file_info(download_url)
            s3_key = f'{opportunity_title}/{file_info["s3_file_name"]}'
            upload_to_s3(s3_key, file_buffer, file_info['content_type'], s3_client)
            
            return {'success': True, 'file_name': download_url, 'source': 'direct'}
            
    except Exception as error:
        print(f'Error processing attachment {attachment.get("download_path", "unknown")}: {str(error)}')
        raise


def lambda_handler(event, context):
    """
    Main handler function - processes SQS messages
    """
    results = []

    try:
        # Validate environment variables
        if not S3_BUCKET:
            raise Exception('BUCKET environment variable is not set')

        # Process each SQS record
        for record in event.get('Records', []):
            try:
                message_body = json.loads(record['body'])
                opportunity_id = message_body.get('opportunity_id')
                opportunity_title = message_body.get('opportunity_title')
                attachments = message_body.get('attachments', [])
                posted_date = message_body.get('posted_date')
                close_date = message_body.get('close_date')
                agency_name = message_body.get('agency_name')

                print(f'Processing opportunity: {opportunity_id} - {opportunity_title}')
                print(f'Number of attachments: {len(attachments)}')

                if not attachments or len(attachments) == 0:
                    print(f'Skipping opportunity {opportunity_id}: no attachments')
                    results.append({
                        'opportunity_id': opportunity_id,
                        'opportunity_title': opportunity_title,
                        'status': 'skipped',
                        'reason': 'no attachments'
                    })
                    continue

                # Process each attachment
                attachment_results = []
                for attachment in attachments:
                    try:
                        result = process_attachment(
                            attachment,
                            opportunity_title,
                            bedrock_client,
                            s3_client
                        )
                        attachment_results.append({
                            'download_path': attachment.get('download_path'),
                            **result
                        })
                    except Exception as error:
                        print(f'Failed to process attachment {attachment.get("download_path", "unknown")}: {str(error)}')
                        attachment_results.append({
                            'download_path': attachment.get('download_path'),
                            'success': False,
                            'error': str(error)
                        })

                results.append({
                    'opportunity_id': opportunity_id,
                    'opportunity_title': opportunity_title,
                    'status': 'completed',
                    'attachments_processed': len(attachment_results),
                    'attachment_results': attachment_results
                })

            except Exception as error:
                print(f'Error processing SQS record: {str(error)}')
                results.append({
                    'status': 'error',
                    'error': str(error),
                    'record_body': record.get('body', 'unknown')
                })

        return {
            'statusCode': 200,
            'results': results
        }

    except Exception as error:
        print(f'Fatal error in worker Lambda: {str(error)}')
        
        return {
            'statusCode': 500,
            'error': str(error),
            'results': results
        }

