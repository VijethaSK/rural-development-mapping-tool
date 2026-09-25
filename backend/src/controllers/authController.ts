import { Request, Response } from 'express';
import { User, CitizenUser } from '../models/User.js';
import { Panchayat } from '../models/Panchayat.js';
import bcrypt from 'bcryptjs';
import { signToken } from '../utils/jwt.js';

export async function register(req: Request, res: Response) {
  try {
    const { name, email, username, password, phone, voterId, ward, village, address } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = (username || cleanEmail.split('@')[0]).toLowerCase().trim();

    // Check existing email/username
    const existing = await User.findOne({
      $or: [{ email: cleanEmail }, { username: cleanUsername }]
    });

    if (existing) {
      res.status(400).json({ error: 'An account with this email or username already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Optional link to default panchayat if available
    let panchayatId = undefined;
    const defaultPanchayat = await Panchayat.findOne();
    if (defaultPanchayat) {
      panchayatId = defaultPanchayat._id;
    }

    const citizen = await CitizenUser.create({
      name: name.trim(),
      email: cleanEmail,
      username: cleanUsername,
      passwordHash,
      role: 'citizen',
      phone: phone?.trim(),
      voterId: voterId?.trim(),
      ward: ward?.trim() || 'Ward 1',
      village: village?.trim() || '',
      address: address?.trim() || '',
      panchayatId,
      complaintsSubmittedCount: 0
    });

    const token = signToken({
      id: citizen._id.toString(),
      role: 'citizen',
      name: citizen.name,
      email: citizen.email
    });

    res.status(201).json({
      message: 'Citizen registration successful',
      token,
      user: {
        id: citizen._id,
        name: citizen.name,
        role: citizen.role,
        email: citizen.email,
        phone: citizen.phone,
        voterId: (citizen as any).voterId,
        ward: citizen.ward,
        village: citizen.village,
        panchayatId: citizen.panchayatId
      }
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  // Allow login via username or email
  const user = await User.findOne({
    $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }]
  });

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ error: 'This account is inactive' });
    return;
  }

  const token = signToken({ id: user._id.toString(), role: user.role, name: user.name, email: user.email });

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      role: user.role,
      designation: (user as any).designation,
      assignedWard: (user as any).assignedWard,
      email: user.email,
      phone: user.phone,
      ward: user.ward,
      village: user.village,
      panchayatId: user.panchayatId,
      voterId: (user as any).voterId
    }
  });
}

export async function me(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
}
