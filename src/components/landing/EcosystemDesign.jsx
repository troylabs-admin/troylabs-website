import React, { useState, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";

const EcosystemDesign = () => {
  const [activeNode, setActiveNode] = useState(null);
  const baseSpeed = 60;

  const nodeConfigs = [
    {
      cx: 400,
      cy: 300,
      size: 80,
      speed: 1.2,
      color: "#FFFFFF",
      info: "BUILD Accelerator",
    },
    {
      cx: 700,
      cy: 200,
      size: 70,
      speed: 0.8,
      color: "#FFFFFF",
      info: "IGNITE Community",
    },
    {
      cx: 600,
      cy: 500,
      size: 75,
      speed: 1,
      color: "#FFFFFF",
      info: "DEMO Exhibition",
    },
    {
      cx: 300,
      cy: 450,
      size: 60,
      speed: 1.5,
      color: "#FFFFFF",
      info: "Startup Workshops",
    },
    {
      cx: 800,
      cy: 400,
      size: 65,
      speed: 1.3,
      color: "#FFFFFF",
      info: "Mentorship Programs",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode((prevNode) => (prevNode + 1) % nodeConfigs.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const EcosystemNode = ({ cx, cy, size, color, info, index }) => (
    <motion.g
      whileHover={{ scale: 1.1 }}
      onClick={() => setActiveNode(index)}
      style={{ cursor: "pointer" }}
    >
      <motion.circle
        cx={cx}
        cy={cy}
        r={size / 2}
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="2"
        animate={
          index === activeNode
            ? {
                scale: [1, 1.2, 1],
                fillOpacity: [0.2, 0.5, 0.2],
              }
            : {}
        }
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "reverse",
        }}
      />
      <motion.text
        x={cx}
        y={cy + size / 2 + 20}
        textAnchor="middle"
        fill={color}
        fontSize="14"
        fontWeight="bold"
      >
        {info}
      </motion.text>
    </motion.g>
  );

  const ConnectingLines = () => (
    <g>
      {nodeConfigs.map((node, index) => (
        <motion.line
          key={index}
          x1={node.cx}
          y1={node.cy}
          x2={nodeConfigs[(index + 1) % nodeConfigs.length].cx}
          y2={nodeConfigs[(index + 1) % nodeConfigs.length].cy}
          stroke="#FFFFFF"
          strokeOpacity="0.3"
          strokeWidth="1"
          strokeDasharray="5,5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      ))}
    </g>
  );

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-[#F19E18] via-[#F08821] to-[#E62314] overflow-hidden">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid meet"
      >
        <ConnectingLines />
        {nodeConfigs.map((config, index) => (
          <EcosystemNode key={index} {...config} index={index} />
        ))}
      </svg>
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <motion.div
          className="text-white text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-4xl font-bold mb-4">TroyLabs Ecosystem</h2>
          <p className="text-xl">Nurturing Innovation and Entrepreneurship</p>
        </motion.div>
      </div>
    </div>
  );
};

export default EcosystemDesign;