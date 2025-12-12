/**
 * Generate Accessible PDF Lambda Function
 * 
 * This function accepts HTML content via API Gateway and converts it to an
 * accessible, tagged PDF using Puppeteer and Chromium. The PDF includes
 * proper structure tags for accessibility compliance.
 */

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/**
 * Generate accessible PDF buffer from HTML content using Puppeteer/Chromium
 * @param {string} html - HTML content to convert to PDF
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateAccessiblePdf = async (html) => {
  let browser = null;
  try {
    console.log('Launching browser for accessible PDF generation');
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    console.log('Browser launched');
    const page = await browser.newPage();
    
    // Set content and wait for it to load
    await page.setContent(html, {
      waitUntil: ['domcontentloaded', 'networkidle0', 'load'],
    });
    
    // Scroll to ensure all content is rendered
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    
    // Generate tagged PDF for accessibility
    // The 'tagged: true' option enables PDF/UA (Universal Accessibility) tagging
    const pdfBuffer = await page.pdf({
      format: 'a4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,  // This enables PDF/UA tagging for accessibility
      outline: true, // This creates document outline/bookmarks
    });
    
    console.log(`Successfully generated accessible PDF, size: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
  } catch (e) {
    console.error('Error generating accessible PDF', { e });
    throw e;
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
};

/**
 * Main Lambda handler
 * Expects a POST request with JSON body containing 'html' field
 */
export const handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));

  try {
    // Parse request body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { html } = body || {};

    if (!html) {
      console.error('Missing HTML content in request');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'HTML content is required',
          message: 'Please provide HTML content in the request body'
        }),
      };
    }

    console.log(`Generating accessible PDF from HTML, size: ${html.length} bytes`);

    // Generate accessible PDF
    const pdfBuffer = await generateAccessiblePdf(html);

    // Return PDF as base64-encoded response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="grant-application.pdf"',
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Error in handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to generate PDF',
        message: error.message || 'Unknown error occurred'
      }),
    };
  }
};

