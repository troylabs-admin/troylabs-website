import React from "react";
import HeroSection from "../components/team/HeroSection";
import WhoWeAre from "../components/team/WhoWeAre";
import ValuesSection from "../components/team/ValuesSection";
import TeamDatabase from "../components/team/TeamDatabase";
import RolesSection from "../components/team/RolesSection";
import Footer from "../components/Footer";

function Team() {
  return (
    <div className="flex flex-col items-center justify-center w-screen overflow-auto">
      <HeroSection />
      <WhoWeAre />
      <ValuesSection />
      <RolesSection />
      <TeamDatabase />
      <Footer />
    </div>
  );
}

export default Team;
