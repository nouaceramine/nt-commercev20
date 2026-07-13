/**
 * SystemStatsCard Component Tests
 * Phase 4g: UI Component Unit Tests
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SystemStatsCard from '../../components/system/SystemStatsCard';

describe('SystemStatsCard', () => {
  const mockStats = {
    products: 150,
    customers: 45,
    sales: 1250,
    users: 8,
  };

  it('should render system statistics', () => {
    render(<SystemStatsCard stats={mockStats} language="ar" />);

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('should render Arabic labels when language is ar', () => {
    render(<SystemStatsCard stats={mockStats} language="ar" />);

    expect(screen.getByText('منتج')).toBeInTheDocument();
    expect(screen.getByText('زبون')).toBeInTheDocument();
    expect(screen.getByText('مبيعات')).toBeInTheDocument();
    expect(screen.getByText('مستخدم')).toBeInTheDocument();
  });

  it('should render French labels when language is fr', () => {
    render(<SystemStatsCard stats={mockStats} language="fr" />);

    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('should not render when stats is null', () => {
    const { container } = render(<SystemStatsCard stats={null} language="ar" />);
    expect(container.firstChild).toBeNull();
  });

  it('should render card title', () => {
    render(<SystemStatsCard stats={mockStats} language="ar" />);
    expect(screen.getByText('إحصائيات النظام')).toBeInTheDocument();
  });
});
