# Grid Layout Rules

Use these rules for every grid or AG Grid surface in studio desktop:

1. Every grid needs a real height chain.
   - Parent: `height: 100%` or `flex: 1 1 auto`
   - Intermediate wrappers: `min-height: 0`
   - Grid container: `height: 100%` and `min-height: 0`

2. The route root must stretch.
   - Wrap views in a flex container.
   - Do not leave the active view as an auto-height fragment.

3. Panels that contain grids must flex.
   - `Panel` body should be `display: flex; flex-direction: column; min-height: 0`
   - The actual grid wrapper should be the flexible child, not a fixed-height inner box.

4. Do not pad out grid pages with spacer blocks.
   - If the page has spare vertical space, give it to the data surface.
   - Do not add bottom notes or empty footers to “balance” the layout.

5. If a grid looks blank until resize, the height chain is broken.
   - Fix the parent sizes first.
   - Do not patch around it with manual resize triggers.
