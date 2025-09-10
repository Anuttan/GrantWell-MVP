import { join } from 'path';
import { buildThemedComponents } from '@cloudscape-design/components-themeable/theming';
const theme = {
   tokens: {
     // Color values test
     colorBackgroundLayoutMain: {
       light: '#00FF00', // Light background for light mode
       dark: '#0A0A0A',  // Dark background for dark mode
     },
     colorTextAccent: {
       light: '#006499', // Valorant red for accents in light mode
       dark: '#D73A45',  // Darker variant for dark mode
     },
     // Using color tokens that are themeable
     colorBackgroundButtonPrimaryDefault: {
       light: '#006499', // Primary button color in light mode
       dark: '#D73A45',  // Primary button color in dark mode
     },
     // Font family
     fontFamilyBase: "Open Sans", 
 
     borderRadiusButton: "8px",
 
   },
   contexts: {
     'top-navigation': {
       tokens: {
         colorTextAccent: '#00AA00', // Accent color for navigation items
       },
     },
     header: {
       tokens: {
         // Additional themable properties for the header can be added here
       },
     },
     flashbar: {
       tokens: {
         
       },
     },
     alert: {
       tokens: {
         colorBackgroundLayoutMain: "black"
       },
     },
   },
 };

buildThemedComponents({ theme, outputDir: join(process.cwd(), './src/themed') });