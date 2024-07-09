import React from "react";
import HeroSection from "../components/partners/HeroSection";
import CurrentPartnersShowcase from "../components/partners/CurrentPartnersShowcase";
import PartnershipBenefits from "../components/partners/PartnershipBenefits";
import TroyLabsImpact from "../components/partners/TroyLabsImpact";
import TroyLabsSupportOptions from "../components/partners/SupportOptions";
import Footer from "../components/Footer";

function Partners() {
  return (
    <div className="flex flex-col items-center justify-center w-screen overflow-auto">
      <HeroSection />
      <CurrentPartnersShowcase />
      <PartnershipBenefits />
      <TroyLabsImpact />
      <TroyLabsSupportOptions />
      <Footer />
    </div>
  );
}

export default Partners;
