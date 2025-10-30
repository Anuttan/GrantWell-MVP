/**
 * Automated NOFO Scraper Worker Lambda Function
 * 
 * This function processes SQS messages containing NOFO opportunity details.
 * It downloads attachments, extracts zip files if needed, identifies NOFO files using Bedrock,
 * and uploads them to S3 for processing by the existing pipeline.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import AdmZip from 'adm-zip';

const S3_BUCKET = process.env.BUCKET;
const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

/**
 * Downloads a file from a URL and returns it as a buffer
 */
async function downloadFile(url) {
  try {
    const response = await fetch(url, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return buffer;
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error.message);
    throw error;
  }
}

/**
 * Extracts a zip file and returns an array of { name, data } objects
 */
function extractZip(zipBuffer) {
  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    
    const extractedFiles = [];
    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        extractedFiles.push({
          name: entry.entryName,
          data: zip.readFile(entry)
        });
      }
    }
    
    return extractedFiles;
  } catch (error) {
    console.error('Error extracting zip file:', error.message);
    throw error;
  }
}

/**
 * Uses Bedrock to identify which file is the NOFO document from a list of file names
 */
async function identifyNofoFile(fileNames, bedrockClient) {
  try {
    const prompt = `Given a list of file names from a grant opportunity package, identify which file is the Notice of Funding Opportunity (NOFO) document. 
NOFO files typically contain terms like: NOFO, Notice, Funding Opportunity, FO, RFA, RFP, Funding Opportunity Announcement, etc.
They are usually PDF files but can also be Word documents or text files.

File names:
${fileNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')}

Return ONLY a JSON object with this exact format:
{"nofoFileName": "filename.pdf"}

If none of the files appear to be a NOFO document, return the first PDF file. If no PDF files exist, return the first file in the list.`;

    const command = new InvokeModelCommand({
      modelId: CLAUDE_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0
      })
    });

    const response = await bedrockClient.send(command);
    const responseBody = new TextDecoder('utf-8').decode(response.body);
    const completion = JSON.parse(responseBody);
    const completionText = completion.content[0].text;

    // Extract JSON from response
    const jsonMatch = completionText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result.nofoFileName;
    }

    // Fallback: return first PDF or first file
    const pdfFile = fileNames.find(name => name.toLowerCase().endsWith('.pdf'));
    return pdfFile || fileNames[0];
  } catch (error) {
    console.error('Error identifying NOFO file with Bedrock:', error.message);
    // Fallback: return first PDF or first file
    const pdfFile = fileNames.find(name => name.toLowerCase().endsWith('.pdf'));
    return pdfFile || fileNames[0];
  }
}

/**
 * Uploads a file to S3
 */
async function uploadToS3(key, fileBuffer, contentType, s3Client) {
  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType
    });
    
    await s3Client.send(command);
    console.log(`Successfully uploaded to S3: ${key}`);
  } catch (error) {
    console.error(`Error uploading to S3: ${key}`, error.message);
    throw error;
  }
}

/**
 * Determines content type and file name based on file extension
 */
function getFileInfo(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  let contentType = 'application/octet-stream';
  let s3FileName = 'NOFO-File-PDF';
  
  if (extension === 'pdf') {
    contentType = 'application/pdf';
    s3FileName = 'NOFO-File-PDF';
  } else if (['txt', 'text'].includes(extension)) {
    contentType = 'text/plain';
    s3FileName = 'NOFO-File-TXT';
  } else if (['doc', 'docx'].includes(extension)) {
    contentType = 'application/msword';
    s3FileName = 'NOFO-File-DOC';
  }
  
  return { contentType, s3FileName };
}

/**
 * Processes a single attachment
 */
async function processAttachment(attachment, opportunityTitle, bedrockClient, s3Client) {
  try {
    const downloadUrl = attachment.download_path;
    console.log(`Processing attachment: ${downloadUrl}`);
    
    // Download the file
    const fileBuffer = await downloadFile(downloadUrl);
    
    // Check if it's a zip file
    const urlParts = downloadUrl.split('.');
    const extension = urlParts[urlParts.length - 1]?.toLowerCase() || '';
    
    if (extension === 'zip') {
      // Extract zip file
      console.log('Extracting zip file...');
      const extractedFiles = extractZip(fileBuffer);
      
      if (extractedFiles.length === 0) {
        throw new Error('Zip file is empty or contains no files');
      }
      
      // Get list of file names for Bedrock identification
      const fileNames = extractedFiles.map(f => f.name);
      console.log(`Extracted ${fileNames.length} files from zip:`, fileNames);
      
      // Use Bedrock to identify the NOFO file
      const nofoFileName = await identifyNofoFile(fileNames, bedrockClient);
      console.log(`Bedrock identified NOFO file: ${nofoFileName}`);
      
      // Find the identified file in extracted files
      const nofoFile = extractedFiles.find(f => f.name === nofoFileName);
      if (!nofoFile) {
        throw new Error(`Identified NOFO file "${nofoFileName}" not found in zip`);
      }
      
      // Get file info and upload
      const { contentType, s3FileName } = getFileInfo(nofoFileName);
      const s3Key = `${opportunityTitle}/${s3FileName}`;
      await uploadToS3(s3Key, nofoFile.data, contentType, s3Client);
      
      return { success: true, fileName: nofoFileName, source: 'zip' };
    } else {
      // Direct file upload (PDF, TXT, etc.)
      const { contentType, s3FileName } = getFileInfo(downloadUrl);
      const s3Key = `${opportunityTitle}/${s3FileName}`;
      await uploadToS3(s3Key, fileBuffer, contentType, s3Client);
      
      return { success: true, fileName: downloadUrl, source: 'direct' };
    }
  } catch (error) {
    console.error(`Error processing attachment ${attachment.download_path}:`, error.message);
    throw error;
  }
}

/**
 * Main handler function - processes SQS messages
 */
export const handler = async (event) => {
  const s3Client = new S3Client({ region: 'us-east-1' });
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
  
  const results = [];

  try {
    // Validate environment variables
    if (!S3_BUCKET) {
      throw new Error('BUCKET environment variable is not set');
    }

    // Process each SQS record
    for (const record of event.Records) {
      try {
        const messageBody = JSON.parse(record.body);
        const {
          opportunity_id,
          opportunity_title,
          attachments,
          posted_date,
          close_date,
          agency_name
        } = messageBody;

        console.log(`Processing opportunity: ${opportunity_id} - ${opportunity_title}`);
        console.log(`Number of attachments: ${attachments?.length || 0}`);

        if (!attachments || attachments.length === 0) {
          console.log(`Skipping opportunity ${opportunity_id}: no attachments`);
          results.push({
            opportunity_id,
            opportunity_title,
            status: 'skipped',
            reason: 'no attachments'
          });
          continue;
        }

        // Process each attachment
        const attachmentResults = [];
        for (const attachment of attachments) {
          try {
            const result = await processAttachment(
              attachment,
              opportunity_title,
              bedrockClient,
              s3Client
            );
            attachmentResults.push({
              download_path: attachment.download_path,
              ...result
            });
          } catch (error) {
            console.error(`Failed to process attachment ${attachment.download_path}:`, error.message);
            attachmentResults.push({
              download_path: attachment.download_path,
              success: false,
              error: error.message
            });
          }
        }

        results.push({
          opportunity_id,
          opportunity_title,
          status: 'completed',
          attachments_processed: attachmentResults.length,
          attachment_results: attachmentResults
        });

      } catch (error) {
        console.error('Error processing SQS record:', error.message);
        results.push({
          status: 'error',
          error: error.message,
          record_body: record.body
        });
      }
    }

    return {
      statusCode: 200,
      results
    };

  } catch (error) {
    console.error('Fatal error in worker Lambda:', error.message);
    
    return {
      statusCode: 500,
      error: error.message,
      results
    };
  }
};

