import { fireEvent, render, screen, within } from '@testing-library/react';
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
  expect(screen.getByText(/the whole product: one tap/i)).toBeInTheDocument();
  expect(screen.queryByText(/why do we only get good ideas/i)).not.toBeInTheDocument();
});

test('bubbles keep their positioning transform (no animation override)', () => {
  const { container } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Bubbles' }));
  const bubbles = container.querySelectorAll('.bubble');
  expect(bubbles.length).toBeGreaterThan(0);
  // Regression test for the collapsed-bubbles bug: the positioning
  // transform (rotate/translate) must survive on the outer button,
  // and the pop-in animation must live on an inner element instead.
  bubbles.forEach((b) => {
    expect(b.style.transform).toMatch(/translate\(/);
    expect(b.querySelector('.bubble-inner')).not.toBeNull();
  });
});

test('editing a thought from the detail modal saves the new text', () => {
  render(<App />);
  fireEvent.click(screen.getByText(/why do we only get good ideas/i));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const editor = screen.getByLabelText(/edit thought/i);
  fireEvent.change(editor, { target: { value: 'edited thought text here' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  // The edited text shows both in the open modal and in the feed behind it.
  expect(screen.getAllByText('edited thought text here').length).toBeGreaterThanOrEqual(1);
});

test('Esc closes the detail modal', () => {
  render(<App />);
  fireEvent.click(screen.getByText(/why do we only get good ideas/i));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('composer [[ autocomplete offers matching thoughts and inserts one', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/drop a thought/i);
  fireEvent.change(input, { target: { value: 'note about [[sho' } });
  const listbox = screen.getByRole('listbox');
  expect(listbox).toBeInTheDocument();
  const suggestion = within(listbox).getByRole('button', { name: 'shower thoughts' });
  fireEvent.mouseDown(suggestion);
  expect(input.value).toContain('[[shower thoughts]]');
});

test('an ambiguous [[link]] opens the disambiguation chooser', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/drop a thought/i);
  fireEvent.change(input, { target: { value: 'which [[shower]] did I mean' } });
  fireEvent.click(screen.getByRole('button', { name: /drop it/i }));
  // The dropped thought's [[shower]] link is ambiguous, not silently resolved.
  fireEvent.click(screen.getByRole('button', { name: 'shower' }));
  const chooser = screen.getByRole('dialog', { name: /which thought did you mean/i });
  expect(chooser).toBeInTheDocument();
  expect(
    within(chooser).getByRole('button', { name: 'shower thoughts' })
  ).toBeInTheDocument();
});
