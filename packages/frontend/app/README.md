# GrantWell MVP - AI-Powered Grant Management Assistant

## Overview
GrantWell MVP is an AI-powered application designed to assist with grant management and processing. The application leverages AWS services and modern web technologies to provide an intelligent interface for grant-related tasks.

## Project Structure
The project is organized into several key components:
- `/packages/frontend` - Frontend React application
- `/packages/backend/chatbot-api` - Backend API services
- `/packages/infrastructure/authorization` - Authentication and authorization services
- `/packages/infrastructure/shared` - Shared utilities and components

## Technology Stack

### Frontend
- React 18 with TypeScript
- AWS Amplify for authentication and API integration
- Cloudscape Design System for UI components
- Material-UI (MUI) for additional UI components
- React Router for navigation
- SASS for styling
- Various React libraries for enhanced functionality:
  - React Markdown for content rendering
  - React Speech Recognition for voice input
  - React Multi Carousel for carousel components

### Backend
- AWS CDK for infrastructure as code
- AWS Lambda for serverless functions
- AWS API Gateway for REST and WebSocket APIs
- AWS Bedrock for AI/ML capabilities
- AWS Cognito for authentication
- AWS S3 for file storage
- DynamoDB for data persistence

## Getting Started

### Prerequisites
- Node.js (Latest LTS version recommended)
- AWS CLI configured with appropriate credentials
- AWS CDK installed globally (`npm install -g aws-cdk`)

### Installation
1. Clone the repository
2. Install dependencies:
```bash
npm install
```

### Development
To run the application in development mode:
```bash
npm run dev
```

## Customization
- UI Components: Located in `/packages/frontend/app/src/components`
- Pages: Located in `/packages/frontend/app/src/pages`
- Constants: Edit `/packages/frontend/app/src/common/constants.ts` for project-wide settings
- Logo: Replace the logo file in the assets directory

## AWS Infrastructure
The application uses AWS CDK for infrastructure management. Key AWS services include:
- AWS Amplify for frontend hosting and CI/CD
- AWS Lambda for serverless backend functions
- AWS API Gateway for API endpoints
- AWS Bedrock for AI/ML capabilities
- AWS Cognito for user authentication
- S3 for file storage
- DynamoDB for data persistence

## Contributing
Please refer to the project's contribution guidelines for details on our code of conduct and the process for submitting pull requests.

## License
This project is licensed under the ISC License.
