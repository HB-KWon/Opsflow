/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 와이어프레임에서 쓴 포인트 컬러를 그대로 토큰화
        navy: '#1F3A5F',
      },
    },
  },
  plugins: [],
};
