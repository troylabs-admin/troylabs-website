import React from "react";
import { motion } from "framer-motion";
import HeroSection from "../components/build/HeroSection";
import BuildOverviewSection from "../components/build/OverviewSection";
import WhatWeDo from "../components/build/WhatWeDo";
import Footer from "../components/Footer";
import StartupDatabase from "../components/build/StartupsDatabase";

const BUILD = () => {
  return (
    <div className="flex flex-col items-center justify-center w-screen overflow-auto">
      <HeroSection />
      <BuildOverviewSection />
      <WhatWeDo />
      <StartupDatabase />
      <Footer />
    </div>
  );
};

export default BUILD;
