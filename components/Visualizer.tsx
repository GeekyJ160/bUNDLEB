import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FileEntry } from '../types';

interface VisualizerProps {
  files: FileEntry[];
}

export const Visualizer: React.FC<VisualizerProps> = ({ files }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize observer for D3 container
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // D3 Force Graph Effect
  useEffect(() => {
    if (!files.length || !svgRef.current || containerWidth === 0) return;

    const width = containerWidth;
    const height = 400;
    
    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // Data structure: Center node "Bundle", leaves are files
    const nodes = [
      { id: "Bundle", group: 1, size: 20 },
      ...files.map(f => ({ id: f.name, group: 2, size: Math.max(5, Math.log(f.size) * 2) }))
    ];

    const links = files.map(f => ({ source: "Bundle", target: f.name }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => d.size + 10));

    const link = svg.append("g")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => d.size)
      .attr("fill", (d: any) => d.group === 1 ? "#ff00ff" : "#00faff")
      .call(drag(simulation) as any);

    node.append("title")
      .text((d: any) => d.id);

    const labels = svg.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d: any) => d.id)
      .attr("font-size", "10px")
      .attr("fill", "#eaf7ff")
      .attr("dx", 12)
      .attr("dy", 4);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);
      
      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    function drag(simulation: any) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    return () => {
      simulation.stop();
    };
  }, [files, containerWidth]);

  // Prepare Recharts Data
  const chartData = files.map(f => ({
    name: f.name.length > 15 ? f.name.substring(0, 12) + '...' : f.name,
    full_name: f.name,
    size: f.size,
  })).sort((a, b) => b.size - a.size);

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-white/10 rounded-xl p-4 shadow-2xl">
        <h3 className="text-neon-cyan font-bold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-cyan"></span>
          Dependency Topology
        </h3>
        <div ref={containerRef} className="w-full h-[400px] bg-dark-bg/50 rounded-lg overflow-hidden relative">
           {!files.length && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              No files to visualize
            </div>
          )}
          <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing"></svg>
        </div>
      </div>

      <div className="bg-dark-card border border-white/10 rounded-xl p-4 shadow-2xl">
        <h3 className="text-neon-magenta font-bold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-magenta"></span>
          Size Distribution (Bytes)
        </h3>
        <div className="w-full h-[300px]">
          {files.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" stroke="#6b7280" />
                <YAxis dataKey="name" type="category" width={100} stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#101320', borderColor: '#333', color: '#fff' }}
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                />
                <Bar dataKey="size" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#00faff' : '#b026ff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              No data
            </div>
          )}
        </div>
      </div>
    </div>
  );
};