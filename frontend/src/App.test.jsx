import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the login screen', () => {
  render(<App />);
  expect(screen.getByText(/stix n vibes admin/i)).toBeInTheDocument();
  expect(screen.getByText(/secure homelab access/i)).toBeInTheDocument();
});