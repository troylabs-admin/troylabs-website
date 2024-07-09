import React from "react";
import HeroSection from "../components/landing/HeroSection";
import Header from "../components/Header";
import About from "../components/landing/About";
import PhotoCollage from "../components/landing/PhotoCollage";
import Ecosystem from "../components/landing/Ecosystem";
import Footer from "../components/Footer";

function Landing() {
  return (
    <div className="flex flex-col items-center justify-center w-screen overflow-auto">
      <HeroSection />
      <About />
      <PhotoCollage />
      <Ecosystem />
      <Footer />
    </div>
  );
}

export default Landing;
