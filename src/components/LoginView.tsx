import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Microscope, ShieldCheck } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import type { UserPublic } from '../shared/types';

interface LoginViewProps {
  onSuccess: (user: UserPublic) => void;
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Shared / Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Student Sign Up state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [enrollmentNo, setEnrollmentNo] = useState('');
  const [department, setDepartment] = useState('CSE (IoT)');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setError(null);
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter both your User ID and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: UserPublic; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Log in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !fullName.trim() || !email.trim() || !password) {
      setError('User ID, full name, email, and password are required.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: UserPublic; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          roll_no: rollNo.trim() || null,
          enrollment_no: enrollmentNo.trim() || null,
          department: department.trim() || 'CSE (IoT)',
          password,
        }),
      });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            Laboratory Equipment Tracker
          </span>
          <span className="text-xs text-slate-600 whitespace-nowrap shrink-0 hidden sm:inline">
            University of Engineering &amp; Management, Kolkata · Dept. of CSE (IoT)
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <section className="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="relative flex-1 min-h-[300px] bg-slate-900 overflow-hidden">
            {!imgError ? (
              <img
                src="/src/assets/images/lab_iot_bench_1795281291425.jpg"
                alt="CSE IoT laboratory workbench with oscilloscope, multimeter, microcontroller kits, and optical microscope"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950 text-slate-200 p-6">
                <Microscope className="w-10 h-10 text-blue-300 mb-3" aria-hidden="true" />
                <p className="text-sm font-medium">UEM Kolkata · CSE (IoT) Instrumentation Bench</p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent flex items-end p-6">
              <div>
                <p className="text-xs font-medium text-blue-200 tracking-wide">
                  Software Engineering Laboratory · Batch 2024–2028
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1 max-w-xl [text-wrap:balance]">
                  Centralized Laboratory Inventory, Issue Verification &amp; Calibration Registry
                </h1>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-200">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Role-Based Access Control</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Issued kit ledgers, borrower history, and user permissions are restricted solely to the laboratory administrator.
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Admin-Verified Returns</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Students submit kit returns for inspection; only the administrator verifies condition and updates asset status.
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-900">QR &amp; Calibration Tracking</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Unique asset tags with ISO/IEC 18004 QR labels, service tickets, and NABL calibration due-date monitoring.
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 flex flex-col justify-center bg-white border border-slate-200 rounded-lg p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-blue-900 mb-3">
            <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold tracking-wide">Authorized Portal Access</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md mb-5" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Student Sign Up
            </button>
          </div>

          {mode === 'login' ? (
            <>
              <h2 className="text-xl font-bold text-slate-900">Log in to your account</h2>
              <p className="text-sm text-slate-600 mt-1">
                Sign in with the fixed administrator credentials or your student User ID and password.
              </p>

              <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="login-username" className="block text-xs font-medium text-slate-700 mb-1.5">
                    User ID / Username
                  </label>
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username or student ID"
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-3.5 py-2.5 pr-10 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  {submitting ? 'Verifying Credentials...' : 'Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-900">Create student account</h2>
              <p className="text-xs text-slate-600 mt-1">
                Register your own User ID &amp; password for view-only inventory access. Administrator credentials remain fixed and additional permissions are granted by the Admin.
              </p>

              <form onSubmit={handleSignupSubmit} className="mt-4 space-y-3" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="signup-username" className="block text-xs font-medium text-slate-700 mb-1">
                      Create User ID
                    </label>
                    <input
                      id="signup-username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. ananya24"
                      className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      id="signup-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@uem.edu.in"
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="signup-roll" className="block text-xs font-medium text-slate-700 mb-1">
                      Roll No
                    </label>
                    <input
                      id="signup-roll"
                      type="text"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                      placeholder="24"
                      className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-enroll" className="block text-xs font-medium text-slate-700 mb-1">
                      Enrollment No
                    </label>
                    <input
                      id="signup-enroll"
                      type="text"
                      value={enrollmentNo}
                      onChange={(e) => setEnrollmentNo(e.target.value)}
                      placeholder="1202400203..."
                      className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-dept" className="block text-xs font-medium text-slate-700 mb-1">
                      Department
                    </label>
                    <input
                      id="signup-dept"
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="signup-password" className="block text-xs font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 4 characters"
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-confirm" className="block text-xs font-medium text-slate-700 mb-1">
                      Confirm Password
                    </label>
                    <input
                      id="signup-confirm"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {submitting ? 'Creating Account...' : 'Create View-Only Student Account'}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
            <p className="font-medium text-slate-700">Access Policy</p>
            <p>
              Student accounts start with view-only access and cannot access the Issued Kits ledger. Additional permissions are configured solely by the Administrator.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Submitted by Kallab Saha, Shahbaz Ali Khan, Subham Das &amp; Priyam Saha · Sec C, CSE (IoT)
          </span>
          <span>Guided by Prof. (Dr.) Arpita Biswas · UEM Kolkata</span>
        </div>
      </footer>
    </div>
  );
}
