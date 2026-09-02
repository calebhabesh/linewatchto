import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React from "react";
import { View } from "react-native";

import {
  AccessibilityIcon,
  ActivityIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  BackIcon,
  BellFilledIcon,
  BellIcon,
  BookmarkIcon,
  BusIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  CloseIcon,
  ConstructionIcon,
  DelayIcon,
  EditIcon,
  ElevatorIcon,
  EscalatorIcon,
  ExternalLinkIcon,
  HistoryIcon,
  InfoIcon,
  LocateIcon,
  MoonIcon,
  PhoneRotateLandscapeIcon,
  PlannedClosureIcon,
  PlusIcon,
  RefreshIcon,
  RotateIcon,
  SearchIcon,
  SunIcon,
  TrainIcon,
  TrashIcon,
  UserIcon,
} from "@/components/operations-icons";
import {
  AlertsTabIcon,
  CommutesTabIcon,
  MapTabIcon,
  MoreTabIcon,
  StationsTabIcon,
} from "@/components/tab-icons";

describe("SVG Icon System", () => {
  const opIcons = [
    { name: "CloseIcon", Component: CloseIcon },
    { name: "BackIcon", Component: BackIcon },
    { name: "ChevronRightIcon", Component: ChevronRightIcon },
    { name: "ChevronDownIcon", Component: ChevronDownIcon },
    { name: "ChevronUpIcon", Component: ChevronUpIcon },
    { name: "LocateIcon", Component: LocateIcon },
    { name: "RefreshIcon", Component: RefreshIcon },
    { name: "SunIcon", Component: SunIcon },
    { name: "MoonIcon", Component: MoonIcon },
    { name: "TrainIcon", Component: TrainIcon },
    { name: "AlertTriangleIcon", Component: AlertTriangleIcon },
    { name: "BellIcon", Component: BellIcon },
    { name: "BellFilledIcon", Component: BellFilledIcon },
    { name: "PlannedClosureIcon", Component: PlannedClosureIcon },
    { name: "DelayIcon", Component: DelayIcon },
    { name: "ArrowRightIcon", Component: ArrowRightIcon },
    { name: "HistoryIcon", Component: HistoryIcon },
    { name: "PhoneRotateLandscapeIcon", Component: PhoneRotateLandscapeIcon },
    { name: "SearchIcon", Component: SearchIcon },
    { name: "BookmarkIcon", Component: BookmarkIcon },
    { name: "ConstructionIcon", Component: ConstructionIcon },
    { name: "InfoIcon", Component: InfoIcon },
    { name: "CheckIcon", Component: CheckIcon },
    { name: "ClockIcon", Component: ClockIcon },
    { name: "RotateIcon", Component: RotateIcon },
    { name: "ExternalLinkIcon", Component: ExternalLinkIcon },
    { name: "AccessibilityIcon", Component: AccessibilityIcon },
    { name: "ElevatorIcon", Component: ElevatorIcon },
    { name: "EscalatorIcon", Component: EscalatorIcon },
    { name: "BusIcon", Component: BusIcon },
    { name: "UserIcon", Component: UserIcon },
    { name: "ActivityIcon", Component: ActivityIcon },
    { name: "PlusIcon", Component: PlusIcon },
    { name: "EditIcon", Component: EditIcon },
    { name: "TrashIcon", Component: TrashIcon },
  ];

  const tabIcons = [
    { name: "MapTabIcon", Component: MapTabIcon },
    { name: "AlertsTabIcon", Component: AlertsTabIcon },
    { name: "StationsTabIcon", Component: StationsTabIcon },
    { name: "CommutesTabIcon", Component: CommutesTabIcon },
    { name: "MoreTabIcon", Component: MoreTabIcon },
  ];

  it("renders all operational icons with standard sizes and custom colors", async () => {
    await render(
      <View>
        {opIcons.map(({ name, Component }) => (
          <View key={name} testID={`icon-${name}`}>
            <Component color="#ff4545" size={24} />
          </View>
        ))}
      </View>,
    );

    for (const { name } of opIcons) {
      expect(screen.getByTestId(`icon-${name}`)).toBeTruthy();
    }
  });

  it("renders all tab icons with standard optical 20dp size", async () => {
    await render(
      <View>
        {tabIcons.map(({ name, Component }) => (
          <View key={name} testID={`tab-icon-${name}`}>
            <Component color="#38bdf8" size={20} />
          </View>
        ))}
      </View>,
    );

    for (const { name } of tabIcons) {
      expect(screen.getByTestId(`tab-icon-${name}`)).toBeTruthy();
    }
  });
});
