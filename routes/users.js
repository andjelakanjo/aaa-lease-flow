const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function requireAdminRole(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
}

router.use(requireAdminRole);

// DELETE /:id — delete user from profiles table and Supabase Auth
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // Fetch the profile to get user_id and enforce scoping
  const { data: profile, error: fetchError } = await supabase.admin
    .from('profiles')
    .select('id, user_id, role, company_id')
    .eq('id', id)
    .single();

  if (fetchError || !profile) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Protect super_admin accounts from deletion
  if (profile.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot delete a super admin.' });
  }

  // Admins can only delete their own company's employees
  if (req.user.role === 'admin') {
    if (profile.company_id !== req.user.companyId || profile.role !== 'employee') {
      return res.status(403).json({ error: 'Access denied.' });
    }
  }

  // Delete profile record first
  const { error: deleteProfileError } = await supabase.admin
    .from('profiles')
    .delete()
    .eq('id', id);

  if (deleteProfileError) {
    return res.status(500).json({ error: 'Failed to delete user.' });
  }

  // Delete from Supabase Auth if the user has an auth account
  if (profile.user_id) {
    const { error: deleteAuthError } = await supabase.admin.auth.admin.deleteUser(profile.user_id);
    if (deleteAuthError) {
      console.error('Failed to delete auth user:', deleteAuthError.message);
      // Profile is already deleted; log but don't fail the request
    }
  }

  res.json({ ok: true });
});

module.exports = router;
