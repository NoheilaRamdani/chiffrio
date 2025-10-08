/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                'bg-color': '#FDF6E3',
                'text-color': '#4A3C6B',
                'primary': '#6D5E92',
                'accent-color': '#FFC700',
                'red-color': '#E54B4B',
                'green-color': '#6D8B74',
                'grid-line-color': 'rgba(74, 60, 107, 0.1)',
            },
            fontFamily: {
                spartan: ['"League Spartan"', 'sans-serif'],
                poppins: ['Poppins', 'sans-serif'],
            },
            boxShadow: {
                'sketchy': '4px 4px 0px 0px var(--text-color)',
                'sketchy-sm': '2px 2px 0px 0px var(--text-color)',
            },
            borderWidth: {
                3: '3px',
            },
        },
    },
    plugins: [],
};