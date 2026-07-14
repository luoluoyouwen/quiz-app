# Topbar and Bottom Glass Alignment

## Goal

Make the fixed top navigation use the same calm glass material as the mobile bottom navigation, while preserving the existing layout, controls, routes, and responsive behavior.

## Visual Direction

- Treat the complete topbar as one rounded glass surface.
- Reuse the bottom capsule material: a semi-transparent surface, `saturate(150%) blur(18px)`, a low-contrast one-pixel border, and the existing soft shadow.
- Remove the topbar's downward gradient veil and mask. It creates a different material model from the bottom capsule and makes the header look detached from its controls.
- Keep nested topbar controls visually quiet. Their default background should be transparent; hover and active states may use a subtle tinted fill.
- Use the existing light and dark theme variables so the glass surface follows the app's gray-blue palette.

## Scope

The change is limited to the final topbar overrides in `src/index.css`. No React structure, navigation behavior, spacing variables, or bottom navigation styles will change.

Both `.nk-navbar` on the home page and `.quiz-desktop-topbar` on secondary pages receive the same material. Mobile keeps its existing dimensions and responsive positioning.

## Interaction And Accessibility

- Existing focus-visible outlines remain intact.
- Hover and pressed states must not change the bar's dimensions or cause control movement.
- The surface must retain sufficient contrast in light and dark themes.
- `prefers-reduced-transparency` continues to provide a non-blurred fallback through the existing global rule.

## Verification

- Build the production bundle.
- Inspect the home and one secondary route at desktop and mobile widths.
- Check light and dark themes for readable text, stable topbar height, no nested opaque capsules, no clipping, and no overlap with page content.
- Confirm the bottom navigation is unchanged.
