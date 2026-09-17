import { createRoot, type Root } from 'react-dom/client';
import { CloudSaveStatus } from '../../../src/components/cloud-save-status';
import type { CloudSaveState } from '../../../src/lib/game/cloud-save';
import type { Locale } from '../../../src/lib/game/i18n';
import { shouldSuggestBilibili } from '../../../src/lib/game/cloud-browser';

// Component-only fixture: it never instantiates a cloud manager or a Toy SDK.
// The root sits at the same place in the help row as the real Toy status.
export function installCloudStatusFixture() {
  let root: Root | null = null;
  let locale: Locale = 'en';
  let status: CloudSaveState['status'] = 'error';
  let retries = 0;
  const failure = () => locale === 'en'
    ? 'Cloud sync failed. Your device save is kept. Check your connection and Bilibili login status, then retry.'
    : '云同步失败，本机存档已保留。请检查网络与哔哩哔哩登录状态后重试。';
  const render = () => root?.render(
    <CloudSaveStatus
      locale={locale}
      status={status}
      label={status === 'checking'
        ? locale === 'en' ? 'Checking Bilibili login status…' : '正在检查哔哩哔哩登录状态…'
        : status === 'synced'
          ? locale === 'en' ? 'Saved to Bilibili cloud' : '已保存至哔哩哔哩云端'
          : status === 'unsupported'
            ? locale === 'en' ? 'Cloud saving not supported' : '当前环境不支持云存档'
            : locale === 'en' ? 'Cloud unavailable · Retry' : '云同步不可用 · 重试'}
      error={status === 'error' ? failure() : undefined}
      busy={status === 'checking'}
      compact={matchMedia('(max-width: 750px)').matches}
      suggestBilibili={shouldSuggestBilibili(navigator.userAgent, { status, error: status === 'error' ? 'unavailable' : null })}
      onRetry={() => { retries++; status = 'checking'; render(); }}
    />,
  );
  Object.assign(window, {
    __communitySeasonsQACloudStatus: Object.freeze({
      mount(requestedLocale: Locale, initialStatus: 'error' | 'checking' = 'error') {
        if (root) throw Error('Cloud status fixture is already mounted.');
        if (requestedLocale !== 'en' && requestedLocale !== 'zh-CN') throw Error('Unsupported fixture locale.');
        const help = document.querySelector('.home-help-actions');
        if (!help) throw Error('Home help actions must be mounted first.');
        const container = document.createElement('div');
        container.className = 'qa-cloud-status-mount';
        container.style.display = 'contents';
        help.append(container);
        root = createRoot(container);
        locale = requestedLocale;
        status = initialStatus;
        render();
      },
      settle(result: 'error' | 'synced' | 'unsupported') {
        if (!root || !['error', 'synced', 'unsupported'].includes(result)) throw Error('Invalid cloud fixture transition.');
        status = result;
        render();
      },
      snapshot() { return { status, retries, cloud: 'disabled' }; },
    }),
  });
}
