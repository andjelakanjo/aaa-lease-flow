const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function getProfileId(req) {
  return req.user?.profileId || null;
}

// GET /api/preferences/theme
router.get('/theme', async (req, res) => {
  const profileId = getProfileId(req);
  if (!profileId) return res.json({ theme: 'dark' });

  const { data, error } = await supabase.admin
    .from('ui_preferences')
    .select('theme')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Failed to load theme.' });
  return res.json({ theme: data?.theme === 'light' ? 'light' : 'dark' });
});

// PUT /api/preferences/theme { theme: 'light'|'dark' }
router.put('/theme', async (req, res) => {
  const profileId = getProfileId(req);
  if (!profileId) return res.status(400).json({ error: 'No profile.' });

  const theme = req.body?.theme === 'light' ? 'light' : 'dark';

  const { error } = await supabase.admin
    .from('ui_preferences')
    .upsert({ profile_id: profileId, theme }, { onConflict: 'profile_id' });

  if (error) return res.status(500).json({ error: 'Failed to save theme.' });
  return res.json({ ok: true, theme });
});

module.exports = router;

