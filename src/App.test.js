import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
});

test('renders the composer and seeded thoughts', () => {
  render(<App />);
  expect(screen.getByPlaceholderText(/drop a thought/i)).toBeInTheDocument();
  // A seeded thought (its unique phrasing, not a [[link]] button).
  expect(screen.getByText(/why do we only get good ideas/i)).toBeInTheDocument();
});

test('dropping a thought adds it to the feed', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/drop a thought/i);
  fireEvent.change(input, { target: { value: 'a brand new test thought' } });
  fireEvent.click(screen.getByRole('button', { name: /drop it/i }));
  expect(screen.getByText('a brand new test thought')).toBeInTheDocument();
});

test('a [[link]] to a seeded thought renders as a link button', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/drop a thought/i);
  fireEvent.change(input, {
    target: { value: 'testing the link to [[shower thoughts]] here' },
  });
  fireEvent.click(screen.getByRole('button', { name: /drop it/i }));
  // One from the seed data, one from the thought just dropped.
  expect(
    screen.getAllByRole('button', { name: 'shower thoughts' }).length
  ).toBeGreaterThanOrEqual(2);
});

test('search filters the feed', () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText(/search thoughts/i), {
    target: { value: 'frictionless' },
  });
  expect(screen.getByText(/frictionless capture is the whole product/i)).toBeInTheDocument();
  expect(screen.queryByText(/why do we only get good ideas/i)).not.toBeInTheDocument();
});
