import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  className = '', 
  ...props 
}) => {
  // Fey Style: Sharp, high contrast, refined
  const baseStyle = "font-sans font-medium tracking-tight flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md active:scale-[0.98]";
  
  const variants = {
    // Primary: Stark White background, black text. The "Action" button.
    primary: "bg-carbon-accent text-carbon-base border border-transparent hover:bg-gray-200 shadow-sm",
    
    // Secondary: Dark grey surface, subtle border
    secondary: "bg-carbon-surface border border-carbon-border text-carbon-text hover:bg-carbon-border hover:text-white",
    
    // Outline: Transparent with border
    outline: "bg-transparent border border-carbon-border text-carbon-muted hover:text-carbon-text hover:border-carbon-lightBorder",
    
    // Danger: Subtle red text
    danger: "bg-red-500/5 border border-red-500/20 text-red-400 hover:bg-red-500/10"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-6 py-2.5 text-sm",
    lg: "px-8 py-3 text-base"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Processing</span>
        </span>
      ) : children}
    </button>
  );
};

export default Button;