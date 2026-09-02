import React from 'react';
import { render, screen } from '@testing-library/react';
import Background from '../../components/Background';

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
  Trans: ({ i18nKey, defaults }) => <span>{defaults || i18nKey}</span>,
}));

import { useTranslation } from 'react-i18next';

const defaultProps = {
  heading: 'Test Heading',
  subheading: 'test_subheading',
  clientLogoPath: '/logo.png',
  clientName: 'Test Client',
  component: <div data-testid="custom-component">Custom</div>,
  oidcService: {
    getEsignetConfiguration: jest.fn(() => ({})),
  },
  authService: {
    getAuthorizeQueryParam: jest.fn(() => 'mock-query'),
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useTranslation.mockReturnValue({
    t: (key) => key,
    i18n: {
      language: 'en',
    },
  });
});

test('renders with all props', () => {
  render(<Background {...defaultProps} />);

  expect(screen.getByAltText('Test Client')).toBeInTheDocument();
  expect(screen.getAllByAltText('logo_alt').length).toBeGreaterThan(0);
  expect(screen.getByTestId('custom-component')).toBeInTheDocument();
  expect(screen.queryByText('noAccount')).not.toBeInTheDocument();
});

test('does not render signup banner', () => {
  render(<Background {...defaultProps} />);
  expect(screen.queryByText('noAccount')).not.toBeInTheDocument();
  expect(
    screen.queryByText('signup_for_unified_login')
  ).not.toBeInTheDocument();
});
