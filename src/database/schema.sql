CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lineUserId TEXT NOT NULL UNIQUE,
  displayName TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount REAL NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'อื่นๆ',
  note TEXT,
  transactionDate TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('text', 'receipt_image', 'screenshot', 'slip')),
  imagePath TEXT,
  ocrText TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(userId, transactionDate);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(userId, status);

CREATE TABLE IF NOT EXISTS pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL UNIQUE,
  transactionId INTEGER NOT NULL,
  action TEXT NOT NULL,
  field TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (transactionId) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  month TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, category, month),
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  name TEXT NOT NULL,
  targetAmount REAL NOT NULL,
  currentAmount REAL NOT NULL DEFAULT 0,
  deadline TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  principalAmount REAL NOT NULL,
  remainingAmount REAL NOT NULL,
  interestRate REAL NOT NULL DEFAULT 0,
  minimumPayment REAL,
  dueDay INTEGER,
  dueDate TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'paid', 'cancelled')) DEFAULT 'active',
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(userId, status);

CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debtId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  amount REAL NOT NULL,
  paymentDate TEXT NOT NULL,
  note TEXT,
  transactionId INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (debtId) REFERENCES debts(id),
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (transactionId) REFERENCES transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_user_date ON debt_payments(userId, paymentDate);
