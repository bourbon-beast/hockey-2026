const allowedOrigins = [
  'https://hockey-2026-f521f.web.app',
  'https://hockey-2026-f521f.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

module.exports = {
  allowedOrigins,
  corsOptions
};
