import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { UserPlus, Users, ShieldCheck, User as UserIcon } from 'lucide-react';
import { db, createUserWithoutSigningIn } from '../firebase';
import { AppUser, AppUserSchema, UserRole } from '../types';
import { useStore } from '../store/useStore';

async function fetchUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => AppUserSchema.parse({ uid: d.id, ...d.data() }));
}

export const Team: React.FC = () => {
  const queryClient = useQueryClient();
  const showToast = useStore((s) => s.showToast);
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const uid = await createUserWithoutSigningIn(email.trim(), password);
      const newUser: AppUser = {
        uid,
        email: email.trim(),
        displayName: displayName.trim() || email.trim().split('@')[0],
        role,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', uid), newUser);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(`${newUser.displayName} added as ${role}`, 'success');
      setDisplayName('');
      setEmail('');
      setPassword('');
      setRole('staff');
    } catch (err: any) {
      const message = err?.code === 'auth/email-already-in-use'
        ? 'That email is already registered.'
        : err?.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters.'
        : 'Could not create the account. Please try again.';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-3xl mx-auto flex flex-col gap-8 pb-12">
        <div className="border-b border-outline-variant pb-6">
          <div className="flex items-center gap-3 text-primary">
            <Users className="h-8 w-8" />
            <h1 className="display-lg text-on-surface font-bold">Team</h1>
          </div>
          <p className="text-sm text-outline mt-2">
            Manage who can sign in. Only managers can add new accounts.
          </p>
        </div>

        <form onSubmit={handleCreate} className="bg-surface p-6 border border-outline-variant rounded-sm shadow-sm flex flex-col gap-4">
          <h2 className="headline-sm font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add a team member
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold label-caps tracking-widest text-outline">Name</label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold label-caps tracking-widest text-outline">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold label-caps tracking-widest text-outline">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold label-caps tracking-widest text-outline">Temporary password</label>
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="self-start h-11 px-6 flex items-center justify-center gap-2 rounded-sm bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {submitting ? 'Adding...' : 'Add team member'}
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h2 className="headline-sm font-semibold border-b border-outline-variant pb-2">
            Current team
          </h2>
          {isLoading && <p className="text-sm text-outline">Loading...</p>}
          {users?.map((u) => (
            <div key={u.uid} className="flex items-center justify-between bg-surface p-4 border border-outline-variant rounded-sm shadow-sm">
              <div className="flex items-center gap-3">
                {u.role === 'manager' ? (
                  <ShieldCheck className="h-4 w-4 text-primary" />
                ) : (
                  <UserIcon className="h-4 w-4 text-outline" />
                )}
                <div>
                  <p className="text-sm font-semibold text-on-surface">{u.displayName}</p>
                  <p className="text-xs text-outline">{u.email}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold label-caps tracking-widest text-outline">{u.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Team;
