import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://axaumzevykpnxovpbyzy.supabase.co'
const supabaseKey = 'sb_publishable_zthKk9ucP2k2gljaje2r8g_b2FCBf_s'

export const supabase = createClient(supabaseUrl, supabaseKey)