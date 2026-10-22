# InWoice Frontend

This frontend now uses Vite and Vitest instead of Create React App.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode with Vite.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Runs the Vitest test suite in CI mode with coverage.

### `npm run build`

Builds the app for production to the `dist` folder.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## Environment

Create `frontend/.env` with:

```env
VITE_API_URL=http://localhost:5000
```

For production, point `VITE_API_URL` at your backend API URL.
