CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  lineUserId TEXT NOT NULL UNIQUE,
  displayName TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'อื่นๆ',
  note TEXT,
  transactionDate DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('text', 'receipt_image', 'screenshot', 'slip')),
  imagePath TEXT,
  ocrText TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(userId, transactionDate);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(userId, status);

CREATE TABLE IF NOT EXISTS pending_actions (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL UNIQUE REFERENCES users(id),
  transactionId BIGINT NOT NULL REFERENCES transactions(id),
  action TEXT NOT NULL,
  field TEXT NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  month TEXT NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, category, month)
);

CREATE TABLE IF NOT EXISTS goals (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  targetAmount NUMERIC NOT NULL,
  currentAmount NUMERIC NOT NULL DEFAULT 0,
  deadline DATE NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debts (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  principalAmount NUMERIC NOT NULL,
  remainingAmount NUMERIC NOT NULL,
  interestRate NUMERIC NOT NULL DEFAULT 0,
  minimumPayment NUMERIC,
  dueDay INTEGER,
  dueDate DATE,
  status TEXT NOT NULL CHECK (status IN ('active', 'paid', 'cancelled')) DEFAULT 'active',
  note TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(userId, status);

CREATE TABLE IF NOT EXISTS debt_payments (
  id BIGSERIAL PRIMARY KEY,
  debtId BIGINT NOT NULL REFERENCES debts(id),
  userId BIGINT NOT NULL REFERENCES users(id),
  amount NUMERIC NOT NULL,
  paymentDate DATE NOT NULL,
  note TEXT,
  transactionId BIGINT REFERENCES transactions(id),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_user_date ON debt_payments(userId, paymentDate);

CREATE TABLE IF NOT EXISTS category_rules (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL REFERENCES users(id),
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, keyword)
);

CREATE INDEX IF NOT EXISTS idx_category_rules_user ON category_rules(userId, keyword);

CREATE TABLE IF NOT EXISTS user_categories (
  id BIGSERIAL PRIMARY KEY,
  userId BIGINT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, name)
);

CREATE INDEX IF NOT EXISTS idx_user_categories_user ON user_categories(userId, name);
