/**
 * Automated NOFO Scraper Lambda Function
 * 
 * This function automatically fetches new grant opportunities from Simpler.Grants.gov API,
 * checks for duplicates, and enqueues them to SQS for processing by the worker Lambda.
 * It integrates with the existing NOFO processing pipeline.
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const API_KEY = process.env.GRANTS_GOV_API_KEY;
const S3_BUCKET = process.env.BUCKET;
const QUEUE_URL = process.env.NOFO_SCRAPER_QUEUE_URL;
const RATE_LIMIT_DELAY = 250; // milliseconds
const OPPORTUNITIES_PER_PAGE = 25; // Grants.gov API returns 25 per page

/**
 * Fetches opportunity IDs from Simpler.Grants.gov API
 */
async function fetchOpportunityIDs(pageNumber = 1) {
  try {
    const requestBody = {
      filters: {
        opportunity_status: {
          one_of: ['posted']
        },
        funding_instrument: {
          one_of: ['grant']
        }
      },
      pagination: {
        page_offset: pageNumber,
        page_size: OPPORTUNITIES_PER_PAGE,
        sort_order: [
          {
            order_by: "opportunity_id",
            sort_direction: "descending" // Get newest first
          }
        ]
      }
    };

    const response = await fetch('https://api.simpler.grants.gov/v1/opportunities/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const opportunities = data?.data || [];

    return opportunities;
  } catch (error) {
    console.error(`Error fetching opportunities page ${pageNumber}:`, error.message);
    throw error;
  }
}

/**
 * Fetches detailed information for a single opportunity
 * Returns all attachments (not just single attachment)
 */
async function fetchOpportunityDetails(opportunityId) {
  try {
    const response = await fetch(`https://api.simpler.grants.gov/v1/opportunities/${opportunityId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'X-API-Key': API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Details API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const opportunityData = data?.data;
    
    if (!opportunityData) {
      return null;
    }

    const attachments = (opportunityData.attachments || []).filter(att => !!att.download_path);
    
    // Return opportunity with ALL attachments (not just single attachment)
    if (attachments.length > 0) {
      return {
        opportunity_id: opportunityData.opportunity_id,
        opportunity_title: opportunityData.opportunity_title,
        attachments: attachments.map(att => ({
          download_path: att.download_path,
          file_description: att.file_description || ''
        })),
        posted_date: opportunityData.posted_date,
        close_date: opportunityData.close_date,
        agency_name: opportunityData.agency_name
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching details for ${opportunityId}:`, error.message);
    return null;
  }
}

/**
 * Checks if a NOFO already exists in S3
 */
async function nofoExistsInS3(opportunityTitle, s3Client) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `${opportunityTitle}/`,
      MaxKeys: 1
    });
    
    const result = await s3Client.send(command);
    const exists = result.Contents && result.Contents.length > 0;
    
    return exists;
  } catch (error) {
    console.error(`Error checking if NOFO exists: ${opportunityTitle}`, error.message);
    return false;
  }
}

/**
 * Enqueues an opportunity to SQS for processing
 */
async function enqueueOpportunity(opportunityData, sqsClient) {
  try {
    const messageBody = JSON.stringify({
      opportunity_id: opportunityData.opportunity_id,
      opportunity_title: opportunityData.opportunity_title,
      attachments: opportunityData.attachments,
      posted_date: opportunityData.posted_date,
      close_date: opportunityData.close_date,
      agency_name: opportunityData.agency_name
    });

    const command = new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody
    });

    await sqsClient.send(command);
    return true;
  } catch (error) {
    console.error(`Error enqueueing opportunity ${opportunityData.opportunity_id}:`, error.message);
    throw error;
  }
}

/**
 * Sleep function for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main handler function
 */
export const handler = async (event) => {
  const s3Client = new S3Client({ region: 'us-east-1' });
  const sqsClient = new SQSClient({ region: 'us-east-1' });
  const enqueuedOpportunities = [];
  const errors = [];
  let totalOpportunities = 0;
  let pageNumber = 1;

  try {
    // Validate environment variables
    if (!API_KEY) {
      throw new Error('GRANTS_GOV_API_KEY environment variable is not set');
    }
    
    if (!S3_BUCKET) {
      throw new Error('BUCKET environment variable is not set');
    }

    if (!QUEUE_URL) {
      throw new Error('NOFO_SCRAPER_QUEUE_URL environment variable is not set');
    }
    
    // Process all available pages of opportunities
    while (true) {
      try {
        const opportunities = await fetchOpportunityIDs(pageNumber);
        
        if (opportunities.length === 0) {
          break; // No more opportunities to process
        }
        
        totalOpportunities += opportunities.length;
        
        // Process each opportunity on this page
        for (const opportunity of opportunities) {
          const opportunityId = opportunity.opportunity_id;
          const opportunityTitle = opportunity.opportunity_title;
          
          try {
            // Check if NOFO already exists
            const exists = await nofoExistsInS3(opportunityTitle, s3Client);
            if (exists) {
              continue; // Skip if already exists
            }

            // Fetch detailed information (including all attachments)
            const details = await fetchOpportunityDetails(opportunityId);
            if (!details || !details.attachments || details.attachments.length === 0) {
              continue; // Skip if no attachments
            }

            // Enqueue opportunity to SQS for processing
            await enqueueOpportunity(details, sqsClient);
            
            enqueuedOpportunities.push({
              opportunity_id: opportunityId,
              opportunity_title: details.opportunity_title,
              attachments_count: details.attachments.length,
              status: 'enqueued'
            });
            
            // Rate limiting between opportunities
            await sleep(RATE_LIMIT_DELAY);
            
          } catch (error) {
            console.error(`Error processing opportunity ${opportunityTitle}:`, error.message);
            
            errors.push({
              opportunity_id: opportunityId,
              opportunity_title: opportunityTitle,
              error: error.message,
              errorType: error.constructor.name
            });
          }
        }
        
        // Rate limiting between pages
        await sleep(RATE_LIMIT_DELAY * 2);
        pageNumber++;
        
      } catch (error) {
        console.error(`Error processing page ${pageNumber}:`, error.message);
        errors.push({
          page: pageNumber,
          error: error.message,
          errorType: error.constructor.name
        });
        break; // Stop processing if page fails
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Automated NOFO scraping discovery completed',
        totalChecked: totalOpportunities,
        enqueued: enqueuedOpportunities.length,
        errors: errors.length,
        enqueuedOpportunities,
        errors,
        pagesProcessed: pageNumber - 1
      }),
    };

  } catch (error) {
    console.error('Fatal error in automated NOFO scraper:', error.message);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Error in automated NOFO scraping discovery',
        error: error.message,
        errorType: error.constructor.name
      }),
    };
  }
};
