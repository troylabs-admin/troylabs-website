# TroyLabs Website

This repository contains the source code for the TroyLabs website, built with React and deployed on Railway. Styled with Tailwind CSS.

## Development Setup

1. **Prerequisites**
   - Node.js (v18 or higher recommended)
   - npm (comes with Node.js)

2. **Installation**
   ```bash
   npm install
   ```

3. **Local Development**
   ```bash
   npm run dev
   ```
   This will start the development server at [http://localhost:3000](http://localhost:3000).

## Project Structure

- `/src/components/` - React components organized by feature
  - `/team/` - Team-related components and data
  - `/build/` - Build-related components and data
- `/public/` - Static assets

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm start` - Serve production build (used in deployment)
- `npm test` - Run tests

## Deployment

The website is automatically deployed to Railway when changes are pushed to the main branch. The deployment process:

1. Runs `npm ci` to install dependencies
2. Executes `npm run build` to create the production build
3. Starts the server using `npm start`

## Adding Content

### Team Members
To add new team members:
1. Update `/src/components/team/TeamData.json`
2. Add their photo to the appropriate directory
3. Follow the existing data structure format

### Startups
To add new startups:
1. Update `/src/components/build/StartupData.json`
2. Add any necessary assets
3. Follow the existing data structure format

## Contributing

1. Create a new branch for your feature
    - `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test locally
4. Submit a pull request via GitHub
