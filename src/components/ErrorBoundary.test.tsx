// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Component that throws on render
function BuggyComponent({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('测试崩溃');
  }
  return <div>正常内容</div>;
}

// Suppress console.error from the caught error
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeTruthy();
  });

  it('displays fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BuggyComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('应用出错')).toBeTruthy();
    expect(screen.getByText(/测试崩溃/)).toBeTruthy();
    expect(screen.getByText('刷新页面')).toBeTruthy();
  });

  it('clicking refresh button calls window.location.reload', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <BuggyComponent shouldThrow />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('刷新页面'));
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('uses custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>自定义错误页</div>}>
        <BuggyComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('自定义错误页')).toBeTruthy();
    expect(() => screen.getByText('应用出错')).toThrow();
  });
});
