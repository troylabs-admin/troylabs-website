import React from "react";
import { motion } from "framer-motion";

// Import images directly
import awsLogo from "../../assets/aws.png";
import greifLogo from "../../assets/Greif.png";
import marshallLogo from "../../assets/Marshall.webp";

const PartnerLogo = ({ src, alt, url, isPrimary }) => {
  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`relative rounded-lg bg-white shadow-md ${
        isPrimary ? "w-64 h-64" : "w-48 h-48"
      } m-4 flex items-center justify-center`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.img
        src={src}
        alt={alt}
        className="w-full h-full object-contain p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      />
    </motion.a>
  );
};

const CurrentPartnersShowcase = () => {
  const primaryPartners = [
    {
      src: marshallLogo,
      alt: "USC Marshall School of Business",
      url: "https://www.marshall.usc.edu/",
    },
    {
      src: greifLogo,
      alt: "Lloyd Greif Center for Entrepreneurship",
      url: "https://www.marshall.usc.edu/departments/lloyd-greif-center-entrepreneurial-studies",
    },
  ];

  const secondaryPartners = [
    {
      src: awsLogo,
      alt: "AWS",
      url: "https://aws.amazon.com/",
    },
    // Add any future secondary partners here
  ];

  return (
    <section className="pt-12 w-full">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl text-gray-500 font-light text-center mb-8">
          Our Valued Partners
        </h2>
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, staggerChildren: 0.1 }}
        >
          <div className="flex flex-wrap justify-center items-center mb-8">
            {primaryPartners.map((partner, index) => (
              <PartnerLogo key={index} {...partner} isPrimary={true} />
            ))}
          </div>
          <div className="flex flex-wrap justify-center items-center">
            {secondaryPartners.map((partner, index) => (
              <PartnerLogo key={index} {...partner} isPrimary={false} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CurrentPartnersShowcase;