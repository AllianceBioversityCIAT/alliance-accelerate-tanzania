/**
 * Unit tests for ContactForm — T-9 (FR-2, FR-5, FR-8, NFR-3, NFR-4, NFR-7).
 *
 * `@/lib/api/contact` is mocked (per `frontend/CLAUDE.md`: "Page tests mock
 * the `lib/api/*` module") — this file's concern is the form's own
 * validation/error-partition contract, not the wire shape `submitContact`
 * emits (that lives in `contact.test.ts`).
 *
 * The centerpiece is FR-5's partition, proven with RENDERED text (KZ-002:
 * "no error was thrown" proves nothing) across every failure shape that
 * must collapse onto the SAME fixed constant:
 *   - a 400 with an EMPTY `details[]` (`BodyShapeValidationPipe`'s shape)
 *   - a 502 (mail-transport rejection)
 *   - a plain network rejection (never reaches `ApiError` at all)
 * ...and the one shape that must NOT collapse onto it — a 400 with a
 * non-empty `details[]`, which renders inline field errors keyed by
 * `field`, exactly like `RegistrationForm`'s inline errors.
 *
 * `ApiError.message` is deliberately set to a string carrying the status
 * code (`HTTP 400 Bad Request`, mirroring what `apiFetch` actually
 * produces on a non-JSON body) in every fixed-constant test below, and each
 * assertion checks that string is ABSENT from the DOM — the disqualifying
 * clause this file exists to close.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import ContactForm, { SUBMIT_FAILURE_MESSAGE, SUBMIT_SUCCESS_MESSAGE } from './ContactForm';
import { ApiError } from '@/lib/api/client';
import { submitContact } from '@/lib/api/contact';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api/contact', () => {
  const actual = jest.requireActual('@/lib/api/contact');
  return {
    ...actual,
    submitContact: jest.fn(),
  };
});

const mockSubmitContact = submitContact as jest.MockedFunction<typeof submitContact>;

const VALID = {
  name: 'Neema Mrema',
  email: 'neema@khsc.co.tz',
  subject: 'Question about listing',
  message: 'How do we get listed in the public directory?',
};

async function fillValidForm() {
  render(<ContactForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^name/i), VALID.name);
  await user.type(screen.getByLabelText(/^email/i), VALID.email);
  fireEvent.change(screen.getByLabelText(/^category/i), { target: { value: 'General inquiry' } });
  await user.type(screen.getByLabelText(/^subject/i), VALID.subject);
  await user.type(screen.getByLabelText(/^message/i), VALID.message);
  await user.click(screen.getByLabelText(/privacy notice/i));
  return user;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ContactForm', () => {
  it('renders every DTO field: name, email, organization, category, subject, message, privacy checkbox', () => {
    render(<ContactForm />);

    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^subject/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/privacy notice/i)).toBeInTheDocument();
  });

  it('offers exactly the eight fixed categories (FR-2)', () => {
    render(<ContactForm />);

    const select = screen.getByLabelText(/^category/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);

    expect(optionLabels).toEqual([
      'Select…',
      'General inquiry',
      'Join the registry',
      'Update or correct actor information',
      'Privacy or consent request',
      'Technical support',
      'Partnership or collaboration',
      'Feedback or suggestion',
      'Other',
    ]);
  });

  describe('the honeypot (FR-8)', () => {
    it('is visually hidden, absent from the accessibility tree, and outside the tab order', () => {
      render(<ContactForm />);

      const input = document.querySelector('input[name="website"]') as HTMLInputElement;
      expect(input).not.toBeNull();

      // Outside the tab order.
      expect(input.tabIndex).toBe(-1);

      // Absent from the accessibility tree — an ancestor carries aria-hidden.
      expect(input.closest('[aria-hidden="true"]')).not.toBeNull();

      // Visually hidden via this codebase's established idiom.
      expect(input.closest('.sr-only')).not.toBeNull();

      // Never surfaced as a labelled, reachable control alongside the real fields.
      expect(
        screen.queryByLabelText(/leave this field blank/i, { selector: 'input:not([tabindex="-1"])' }),
      ).toBeNull();
    });

    it('is not present in the accessible name/role queries a real user or AT would use', () => {
      render(<ContactForm />);
      // getByRole with the default (accessible-tree-only) query set must not
      // surface a "website" textbox — aria-hidden removes it entirely.
      const textboxes = screen.getAllByRole('textbox');
      const names = textboxes.map((el) => el.getAttribute('id'));
      expect(names.some((id) => id?.includes('website'))).toBe(false);
    });
  });

  describe('client-side validation', () => {
    it('rejects an empty submit with field-level errors and never calls submitContact', async () => {
      const user = userEvent.setup();
      render(<ContactForm />);

      await user.click(screen.getByRole('button', { name: /send message/i }));

      expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/select a category/i)).toBeInTheDocument();
      expect(screen.getByText(/subject is required/i)).toBeInTheDocument();
      expect(screen.getByText(/message is required/i)).toBeInTheDocument();
      expect(screen.getByText(/must acknowledge the privacy notice/i)).toBeInTheDocument();
      expect(mockSubmitContact).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    it('announces success through a live region and clears the form', async () => {
      mockSubmitContact.mockResolvedValue(undefined);
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent(SUBMIT_SUCCESS_MESSAGE);
      expect(status).toHaveAttribute('aria-live', 'polite');
      // The form itself is gone — replaced by the confirmation panel.
      expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
    });

    it('moves focus onto the success panel (T9-A1) so a screen-reader user is told the outcome', async () => {
      mockSubmitContact.mockResolvedValue(undefined);
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      const status = await screen.findByRole('status');
      expect(status).toHaveFocus();
    });
  });

  describe("FR-5's partition — every non-field-error outcome renders the SAME fixed constant", () => {
    it('a 400 with an EMPTY details[] renders the fixed constant, never ApiError.message', async () => {
      mockSubmitContact.mockRejectedValue(
        new ApiError(400, 'HTTP 400 Bad Request', []),
      );
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      const banner = await screen.findByTestId('submit-error');
      expect(banner).toHaveTextContent(SUBMIT_FAILURE_MESSAGE);
      expect(banner).toHaveAttribute('aria-live', 'assertive');
      expect(screen.queryByText(/HTTP 400 Bad Request/)).not.toBeInTheDocument();
    });

    it('a 502 (transport rejection) renders the fixed constant, never ApiError.message', async () => {
      mockSubmitContact.mockRejectedValue(new ApiError(502, 'HTTP 502 Bad Gateway'));
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      const banner = await screen.findByTestId('submit-error');
      expect(banner).toHaveTextContent(SUBMIT_FAILURE_MESSAGE);
      expect(screen.queryByText(/HTTP 502 Bad Gateway/)).not.toBeInTheDocument();
      expect(screen.queryByText(/502/)).not.toBeInTheDocument();
    });

    it('a plain network rejection renders the fixed constant', async () => {
      mockSubmitContact.mockRejectedValue(new TypeError('Failed to fetch'));
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      const banner = await screen.findByTestId('submit-error');
      expect(banner).toHaveTextContent(SUBMIT_FAILURE_MESSAGE);
      expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    });

    it('preserves every value the visitor entered across a failed submit', async () => {
      mockSubmitContact.mockRejectedValue(new ApiError(502, 'HTTP 502 Bad Gateway'));
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));
      await screen.findByTestId('submit-error');

      expect(screen.getByLabelText(/^name/i)).toHaveValue(VALID.name);
      expect(screen.getByLabelText(/^email/i)).toHaveValue(VALID.email);
      expect(screen.getByLabelText(/^subject/i)).toHaveValue(VALID.subject);
      expect(screen.getByLabelText(/^message/i)).toHaveValue(VALID.message);
      expect(screen.getByLabelText(/^category/i)).toHaveValue('General inquiry');
      expect(screen.getByLabelText(/privacy notice/i)).toBeChecked();
    });
  });

  describe("FR-5's partition — a non-empty details[] maps to inline field errors", () => {
    it('renders the server field message inline, keyed by field, with NO fixed-constant banner', async () => {
      mockSubmitContact.mockRejectedValue(
        new ApiError(400, 'HTTP 400 Bad Request', [
          { field: 'email', message: 'email must be an email' },
        ]),
      );
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      expect(await screen.findByText('email must be an email')).toBeInTheDocument();
      expect(screen.queryByTestId('submit-error')).not.toBeInTheDocument();
      expect(screen.queryByText(SUBMIT_FAILURE_MESSAGE)).not.toBeInTheDocument();

      const emailInput = screen.getByLabelText(/^email/i);
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('preserves values on a field-level rejection too', async () => {
      mockSubmitContact.mockRejectedValue(
        new ApiError(400, 'HTTP 400 Bad Request', [
          { field: 'subject', message: 'subject must be shorter' },
        ]),
      );
      await fillValidForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));
      await screen.findByText('subject must be shorter');

      expect(screen.getByLabelText(/^name/i)).toHaveValue(VALID.name);
      expect(screen.getByLabelText(/^message/i)).toHaveValue(VALID.message);
    });
  });

  describe('accessibility (NFR-3)', () => {
    it('has no jest-axe violations on initial render', async () => {
      const { container } = render(<ContactForm />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no jest-axe violations with the error summary visible', async () => {
      const user = userEvent.setup();
      const { container } = render(<ContactForm />);
      await user.click(screen.getByRole('button', { name: /send message/i }));
      await screen.findByText(/name is required/i);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
