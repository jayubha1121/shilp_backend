const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const cookieName = 'shilp_admin_session';
const sessionSeconds = 60 * 60 * 12;
const adminSchema = new mongoose.Schema({
  _id: { type: String, default: 'primary' },
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true, versionKey: false, collection: 'adminAccounts' });
const AdminAccount = mongoose.models.AdminAccount || mongoose.model('AdminAccount', adminSchema);

function assertAuthConfig() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET to a random value of at least 32 characters.');
  }
}

function validateRegistration(value) {
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const email = typeof value?.email === 'string' ? value.email.trim().toLowerCase() : '';
  const password = typeof value?.password === 'string' ? value.password : '';

  if (!name || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return null;
  }
  return { name, email, password };
}

async function setupStatus(_req, res, next) {
  try {
    const setupRequired = !(await AdminAccount.exists({ _id: 'primary' }));
    return res.json({ success: true, setupRequired: Boolean(setupRequired) });
  } catch (error) {
    return next(error);
  }
}

function setSession(res, account) {
  const token = jwt.sign({ email: account.email, name: account.name, accountId: account._id }, process.env.JWT_SECRET, {
    subject: 'admin',
    expiresIn: sessionSeconds,
  });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: sessionSeconds * 1000,
    path: '/',
  });
}

async function register(req, res, next) {
  const registration = validateRegistration(req.body);
  if (!registration) {
    return res.status(400).json({
      success: false,
      message: 'Enter a name, valid email, and password of at least 12 characters (maximum 72 UTF-8 bytes).',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(registration.password, 12);
    const account = await AdminAccount.create({
      _id: 'primary',
      name: registration.name,
      email: registration.email,
      passwordHash,
    });
    setSession(res, account);
    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully.',
      user: { id: account.id, email: account.email, name: account.name },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'The admin account has already been set up. Please sign in.' });
    }
    return next(error);
  }
}

async function login(req, res, next) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  try {
    const account = await AdminAccount.findOne({ email }).select('+passwordHash');
    if (!account || Buffer.byteLength(password, 'utf8') > 72 || !(await bcrypt.compare(password, account.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
    }

    setSession(res, account);
    return res.json({ success: true, message: 'Login successful', user: { id: account.id, email: account.email, name: account.name } });
  } catch (error) {
    return next(error);
  }
}

function authenticate(req, res, next) {
  const token = req.cookies?.[cookieName];
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });

  try {
    const session = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof session !== 'object' || session.sub !== 'admin' || session.accountId !== 'primary') {
      return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
    }
    return AdminAccount.findById('primary').then((account) => {
      if (!account || account.email !== session.email) {
        return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
      }
      req.admin = { id: account.id, email: account.email, name: account.name };
      return next();
    }).catch(next);
  } catch {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
  }
}

function authenticateOptional(req, res, next) {
  const token = req.cookies?.[cookieName];
  if (!token) return next();

  try {
    const session = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof session !== 'object' || session.sub !== 'admin' || session.accountId !== 'primary') return next();
    return authenticate(req, res, next);
  } catch {
    return next();
  }
}

function logout(_req, res) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
  });
  return res.json({ success: true });
}

module.exports = { assertAuthConfig, authenticate, authenticateOptional, login, logout, register, setupStatus, validateRegistration };
