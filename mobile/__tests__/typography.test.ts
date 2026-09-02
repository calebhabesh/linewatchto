import { describe, expect, it } from "@jest/globals";
import { fontFamilies, typography } from "@/theme/typography";

describe("Typography & Font System", () => {
  it("defines explicit fontFamilies for Inter (sans) and JetBrains Mono (mono)", () => {
    expect(fontFamilies.sans.regular).toBe("Inter_400Regular");
    expect(fontFamilies.sans.medium).toBe("Inter_500Medium");
    expect(fontFamilies.sans.semiBold).toBe("Inter_600SemiBold");
    expect(fontFamilies.sans.bold).toBe("Inter_700Bold");
    expect(fontFamilies.sans.extraBold).toBe("Inter_800ExtraBold");
    expect(fontFamilies.sans.black).toBe("Inter_900Black");

    expect(fontFamilies.mono.regular).toBe("JetBrainsMono_400Regular");
    expect(fontFamilies.mono.medium).toBe("JetBrainsMono_500Medium");
    expect(fontFamilies.mono.semiBold).toBe("JetBrainsMono_600SemiBold");
    expect(fontFamilies.mono.bold).toBe("JetBrainsMono_700Bold");
    expect(fontFamilies.mono.extraBold).toBe("JetBrainsMono_800ExtraBold");
  });

  it("applies fontFamily to every typography style token", () => {
    const keys = Object.keys(typography) as Array<keyof typeof typography>;
    for (const key of keys) {
      const style = typography[key];
      expect(style.fontFamily).toBeDefined();
      expect(typeof style.fontFamily).toBe("string");
      expect(style.fontSize).toBeGreaterThan(0);
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
    }
  });

  it("ensures mono styles use JetBrainsMono and UI styles use Inter", () => {
    expect(typography.displayStation.fontFamily).toBe("Inter_900Black");
    expect(typography.sheetTitle.fontFamily).toBe("Inter_800ExtraBold");
    expect(typography.sectionTitle.fontFamily).toBe("Inter_800ExtraBold");
    expect(typography.cardTitle.fontFamily).toBe("Inter_700Bold");
    expect(typography.body.fontFamily).toBe("Inter_400Regular");
    expect(typography.bodyMedium.fontFamily).toBe("Inter_500Medium");
    expect(typography.bodyBold.fontFamily).toBe("Inter_700Bold");
    expect(typography.meta.fontFamily).toBe("Inter_700Bold");
    expect(typography.badge.fontFamily).toBe("Inter_800ExtraBold");

    expect(typography.metric.fontFamily).toBe("JetBrainsMono_700Bold");
    expect(typography.monoSmall.fontFamily).toBe("JetBrainsMono_500Medium");
    expect(typography.monoLarge.fontFamily).toBe("JetBrainsMono_700Bold");
  });
});
