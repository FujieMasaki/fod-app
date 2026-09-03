import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import { HomeHero } from "@/features/home";

export default function HomePage() {
  return (
    <ScreenLayout activeTab="home">
      <HomeHero />
    </ScreenLayout>
  );
}
