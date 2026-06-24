exports.handler = async function () {
  const hookUrl = String(process.env.NETLIFY_BLOG_BUILD_HOOK_URL || process.env.NETLIFY_BUILD_HOOK_URL || '').trim();

  if (!hookUrl) {
    console.warn('blog_publish_cron_skipped missing NETLIFY_BLOG_BUILD_HOOK_URL');
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: 'missing_build_hook' }),
    };
  }

  try {
    const response = await fetch(hookUrl, { method: 'POST' });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('blog_publish_cron_failed', response.status, text.slice(0, 500));
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, status: response.status }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, triggered: true }),
    };
  } catch (error) {
    console.error('blog_publish_cron_error', error && error.message ? error.message : error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'build_hook_request_failed' }),
    };
  }
};
