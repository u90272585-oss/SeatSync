'use strict';
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password,salt,64);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const key = await derive(password,salt,64);
  const expected = Buffer.from(hex,'hex');
  return key.length === expected.length && timingSafeEqual(key,expected);
}
module.exports = { hashPassword, verifyPassword };
