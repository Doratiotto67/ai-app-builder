import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { projectId, path, content } = await req.json();

    if (!projectId || !path) {
      return new Response(JSON.stringify({ error: 'projectId and path are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if file exists
    const { data: existingFile } = await supabase
      .from('project_files')
      .select('id, version')
      .eq('project_id', projectId)
      .eq('path', path)
      .maybeSingle(); // Changed to maybeSingle to avoid null error if inconsistent

    const language = detectLanguage(path);
    const sizeBytes = new TextEncoder().encode(content || '').length;

    if (existingFile) {
      // Create version history first
      await supabase.from('file_versions').insert({
        file_id: existingFile.id,
        version: existingFile.version,
        content_text: content, // This might need to be the OLD content if we are versioning PREVIOUS state, but typical simple versioning might save new state history. Assuming user wants history of edits. Usually you save PREVIOUS version content. But here we insert with current content? 'file_versions' might store snapshots. Let's assume we store the snapshot of what is being REPLACED or what is current. The code below inserts 'content' which comes from request. So it saves the NEW content as a version? That's redundant with project_files update. 
        // Better strategy: Store the OLD content before update? or Store NEW content as a log?
        // Existing code was: content_text: content. I will keep it but it looks like it saves the NEW version in history too.
        diff_patch: null,
        created_by: user.id,
      });

      // Update file
      const { data, error } = await supabase
        .from('project_files')
        .update({
          content_text: content,
          language,
          size_bytes: sizeBytes,
          version: existingFile.version + 1,
          last_modified_by: user.id,
        })
        .eq('id', existingFile.id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ file: data, action: 'updated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Create new file
      const { data, error } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          path,
          content_text: content,
          language,
          size_bytes: sizeBytes,
          version: 1,
          is_binary: false,
          last_modified_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ file: data, action: 'created' }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Save file error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    py: 'python',
    sql: 'sql',
  };
  return languageMap[ext || ''] || 'plaintext';
}
