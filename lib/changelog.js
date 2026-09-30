const repository = 'sai-preetham/hmt-fulfillment';

export async function getChangelog(fetchImpl = fetch) {
  // Every main change must arrive through a PR. Fetch all pages so old changes
  // do not disappear as the repository grows. Never expose a GitHub token.
  const entries = [];
  try {
    for (let page = 1; ; page++) {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`, {
        headers: { Accept: 'application/vnd.github+json' },
        next: { revalidate: 300 }, signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error('Change history is temporarily unavailable.');
      const pulls = await response.json();
      for (const pr of pulls) {
        if (pr.merged_at && pr.base?.ref === 'main') entries.push({
          number: pr.number, title: pr.title, description: pr.body || pr.title,
          date: pr.merged_at, url: pr.html_url
        });
      }
      if (pulls.length < 100) break;
    }
    return { entries: entries.sort((a, b) => b.date.localeCompare(a.date)), error: null };
  } catch {
    return { entries: [], error: 'Change history is temporarily unavailable. Please try again later.' };
  }
}
