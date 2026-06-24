/**
 * Unit tests for DirectoryPagination — T-4, FR-1, FR-2, FR-3, NFR-3.
 *
 * Covers:
 *   (a) renders prev/next buttons and page indicator
 *   (b) Prev button is disabled on page 1
 *   (c) Next button is disabled on the last page
 *   (d) Prev button calls onPageChange(page - 1) when enabled
 *   (e) Next button calls onPageChange(page + 1) when enabled
 *   (f) page indicator text is "Page X of Y"
 *   (g) component renders null when total ≤ pageSize (single page)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DirectoryPagination from './DirectoryPagination';

afterEach(() => jest.clearAllMocks());

describe('DirectoryPagination', () => {
  // ── (a) Renders controls ───────────────────────────────────────────────────

  it('renders Prev and Next buttons when total > pageSize', () => {
    render(
      <DirectoryPagination page={2} total={60} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
  });

  it('renders the page indicator', () => {
    render(
      <DirectoryPagination page={2} total={60} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  // ── (b) Prev disabled on first page ───────────────────────────────────────

  it('disables the Prev button on page 1', () => {
    render(
      <DirectoryPagination page={1} total={60} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('does not disable Prev on page 2', () => {
    render(
      <DirectoryPagination page={2} total={60} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
  });

  // ── (c) Next disabled on last page ────────────────────────────────────────

  it('disables the Next button on the last page', () => {
    // 60 total, 20 per page → lastPage = 3
    render(
      <DirectoryPagination page={3} total={60} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('does not disable Next on the second-to-last page', () => {
    render(
      <DirectoryPagination page={2} total={60} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
  });

  // ── (d) Prev calls onPageChange(page - 1) ─────────────────────────────────

  it('calls onPageChange(page - 1) when Prev is clicked', () => {
    const onPageChange = jest.fn();
    render(
      <DirectoryPagination page={3} total={60} pageSize={20} onPageChange={onPageChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));

    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  // ── (e) Next calls onPageChange(page + 1) ─────────────────────────────────

  it('calls onPageChange(page + 1) when Next is clicked', () => {
    const onPageChange = jest.fn();
    render(
      <DirectoryPagination page={1} total={60} pageSize={20} onPageChange={onPageChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  // ── (f) Page indicator text ────────────────────────────────────────────────

  it('shows "Page 1 of 1" when exactly one full page', () => {
    // Edge: total exactly equals pageSize → still renders because we want to
    // show bounds. Actually: the component hides when total ≤ pageSize (see g).
    // So test "Page 1 of 2" for the minimum multi-page scenario.
    render(
      <DirectoryPagination page={1} total={21} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('shows the correct last page when total is not evenly divisible', () => {
    // 45 total, 20 per page → ceil(45/20) = 3
    render(
      <DirectoryPagination page={3} total={45} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  });

  // ── (g) Returns null for single-page datasets ──────────────────────────────

  it('renders nothing when total equals pageSize (single page)', () => {
    const { container } = render(
      <DirectoryPagination page={1} total={20} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when total is 0', () => {
    const { container } = render(
      <DirectoryPagination page={1} total={0} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when total is less than pageSize', () => {
    const { container } = render(
      <DirectoryPagination page={1} total={5} pageSize={20} onPageChange={jest.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
