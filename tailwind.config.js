/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                carbon: {
                    base: '#000000',
                    surface: '#0A0A0A',
                    card: '#111111',
                    border: '#262626',
                    lightBorder: '#404040',
                    text: '#EDEDED',
                    muted: '#888888',
                    accent: '#FFFFFF',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Inter', 'sans-serif']
            },
            borderRadius: {
                'xs': '4px',
                'sm': '6px',
                'md': '8px',
                'lg': '12px',
                'xl': '16px',
            },
            animation: {
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'scan': 'scan 3s linear infinite',
                'fade-in': 'fadeIn 0.3s ease-out',
                'shine': 'shine 3s linear infinite',
            },
            keyframes: {
                scan: {
                    '0%': { transform: 'translateY(-100%)' },
                    '100%': { transform: 'translateY(100%)' },
                },
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(5px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                shine: {
                    '0%': { backgroundPosition: '200% center' },
                    '100%': { backgroundPosition: '-200% center' },
                }
            }
        },
    },
    plugins: [],
}
