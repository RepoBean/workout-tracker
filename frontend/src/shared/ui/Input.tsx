import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-3 py-2.5 border-2 rounded-lg transition-all duration-200
            focus:outline-none focus:border-primary-500 focus:shadow-input-focus focus:ring-0
            ${error ? 'border-red-500' : 'border-gray-200 dark:border-surface-800'}
            bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            disabled:bg-gray-100 dark:disabled:bg-surface-850 disabled:cursor-not-allowed
            ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
