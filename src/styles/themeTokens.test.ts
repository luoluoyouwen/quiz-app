import { describe, expect, it } from 'vitest';
import { getAppThemeTokens } from './themeTokens';

describe('themeTokens', () => {
  it('uses a coordinated gray-blue dark palette', () => {
    const tokens = getAppThemeTokens(true);

    expect(tokens.cssVars['--app-bg']).toBe('#0b111c');
    expect(tokens.cssVars['--app-surface-solid']).toBe('#151e2d');
    expect(tokens.cssVars['--app-surface-raised']).toBe('#1b2638');
    expect(tokens.cssVars['--app-primary']).toBe('#4f6f95');
    expect(tokens.cssVars['--app-success']).toBe('#84b799');
    expect(tokens.cssVars['--app-review']).toBe('#d3aa68');
    expect(tokens.cssVars['--app-error']).toBe('#d88a8a');
  });

  it('keeps Ant Design surfaces in the same visual family', () => {
    const tokens = getAppThemeTokens(true);

    expect(tokens.antdToken.colorBgBase).toBe('#0b111c');
    expect(tokens.antdToken.colorBgContainer).toBe('#151e2d');
    expect(tokens.antdToken.colorBgElevated).toBe('#1b2638');
    expect(tokens.antdToken.colorPrimary).toBe('#4f6f95');
    expect(tokens.antdToken.borderRadius).toBe(16);
  });
});
