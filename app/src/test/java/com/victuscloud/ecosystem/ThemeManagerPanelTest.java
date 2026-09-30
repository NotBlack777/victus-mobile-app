package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * OLED / standard display-panel rules.
 *
 * <p>The constraint worth pinning is that true black is a <em>dark</em> panel
 * setting. A stored OLED preference has to survive a trip through light mode
 * intact rather than painting a black canvas under light text, and an
 * unrecognised or missing value must never resolve to OLED: that would leave
 * the app with unreadable content and no obvious way back.</p>
 */
public class ThemeManagerPanelTest {

    @Test
    public void oledAppliesInDarkMode() {
        assertTrue(ThemeManager.isOledPanel(ThemeManager.PANEL_OLED, true));
    }

    @Test
    public void oledStaysInertInLightMode() {
        // True black in light mode would be an unreadable black-on-light page.
        assertFalse(ThemeManager.isOledPanel(ThemeManager.PANEL_OLED, false));
    }

    @Test
    public void standardPanelIsNeverOled() {
        assertFalse(ThemeManager.isOledPanel(ThemeManager.PANEL_LCD, true));
        assertFalse(ThemeManager.isOledPanel(ThemeManager.PANEL_LCD, false));
    }

    @Test
    public void unknownValuesFallBackToTheStandardPanel() {
        assertEquals(ThemeManager.PANEL_LCD, ThemeManager.normalizePanel(null));
        assertEquals(ThemeManager.PANEL_LCD, ThemeManager.normalizePanel(""));
        assertEquals(ThemeManager.PANEL_LCD, ThemeManager.normalizePanel("amoled"));
        assertEquals(ThemeManager.PANEL_LCD, ThemeManager.normalizePanel("OLED "));
        assertEquals(ThemeManager.PANEL_OLED, ThemeManager.normalizePanel("oled"));
    }

    @Test
    public void normalisingIsIdempotent() {
        for (String value : new String[]{ThemeManager.PANEL_OLED, ThemeManager.PANEL_LCD,
                null, "nonsense"}) {
            String once = ThemeManager.normalizePanel(value);
            assertEquals(once, ThemeManager.normalizePanel(once));
        }
    }
}
