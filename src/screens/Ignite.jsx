import React from "react";
import HeroSection from "../components/ignite/HeroSection";
import OverviewSection from "../components/ignite/OverviewSection";

function Ignite() {
  return (
    <div className="flex flex-col items-center justify-center w-screen overflow-auto">
      <HeroSection />
      <OverviewSection />
    </div>
  );
}

export default Ignite;
