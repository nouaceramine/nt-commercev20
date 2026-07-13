/**
 * UsersTable Component Tests
 * Phase 4g: UI Component Unit Tests
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UsersTable from '../../components/permissions/UsersTable';

describe('UsersTable', () => {
  const mockUsers = [
    { id: '1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    { id: '2', name: 'Seller User', email: 'seller@test.com', role: 'seller' },
    { id: '3', name: 'Manager User', email: 'manager@test.com', role: 'manager' },
  ];

  const mockT = {
    userPermissions: 'صلاحيات المستخدمين',
    name: 'الاسم',
    email: 'البريد',
    actions: 'إجراءات',
    permissions: 'صلاحيات',
  };

  const defaultProps = {
    users: mockUsers,
    currentUserId: '1',
    language: 'ar',
    t: mockT,
    onEdit: jest.fn(),
    onPermissions: jest.fn(),
    onPassword: jest.fn(),
    onDelete: jest.fn(),
    onAdd: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render users table', () => {
    render(<UsersTable {...defaultProps} />);

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('seller@test.com')).toBeInTheDocument();
    expect(screen.getByText('Manager User')).toBeInTheDocument();
  });

  it('should render role badges', () => {
    render(<UsersTable {...defaultProps} />);

    expect(screen.getByText('مدير')).toBeInTheDocument();
    expect(screen.getByText('بائع')).toBeInTheDocument();
    expect(screen.getByText('مشرف')).toBeInTheDocument();
  });

  it('should call onAdd when add button clicked', () => {
    render(<UsersTable {...defaultProps} />);

    const addButton = screen.getByTestId('add-user-btn');
    fireEvent.click(addButton);

    expect(defaultProps.onAdd).toHaveBeenCalledTimes(1);
  });

  it('should call onEdit when edit button clicked', () => {
    render(<UsersTable {...defaultProps} />);

    const editButtons = screen.getAllByTitle('تعديل');
    fireEvent.click(editButtons[1]); // Click seller's edit button

    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockUsers[1]);
  });

  it('should call onPermissions when permissions button clicked', () => {
    render(<UsersTable {...defaultProps} />);

    const permButtons = screen.getAllByTitle(mockT.permissions);
    fireEvent.click(permButtons[0]); // Click seller's permissions

    expect(defaultProps.onPermissions).toHaveBeenCalledWith('2');
  });

  it('should disable permissions for current user', () => {
    render(<UsersTable {...defaultProps} />);

    const permButtons = screen.getAllByTitle(mockT.permissions);
    // First user (admin) is current user, so button should be disabled
    expect(permButtons[0]).toBeDisabled();
  });

  it('should call onDelete when delete button clicked', () => {
    render(<UsersTable {...defaultProps} />);

    const deleteButtons = screen.getAllByTitle('حذف');
    fireEvent.click(deleteButtons[0]); // Delete seller

    expect(defaultProps.onDelete).toHaveBeenCalledWith('2');
  });

  it('should render empty table', () => {
    render(<UsersTable {...defaultProps} users={[]} />);
    expect(screen.getByText(mockT.userPermissions)).toBeInTheDocument();
  });
});
