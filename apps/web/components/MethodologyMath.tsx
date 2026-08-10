"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import "katex/dist/katex.min.css";

export function MethodologyMath({ expression }: { expression: string }) {
  return (
    <div className="methodology-code methodology-math">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {`$$${expression}$$`}
      </ReactMarkdown>
    </div>
  );
}
