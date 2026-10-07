import { ContentListContext } from '../ContentListContext';

const data = {
  title: 'Chennai Deals',
  description: 'Local deals and offers',
};

export default function App() {
  return (
    <ContentListContext.Provider value={data}>
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="mb-4 text-sm uppercase tracking-[0.2em] text-cyan-300">Website</p>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Chennai Deals</h1>
          <p className="mt-6 max-w-xl text-lg text-slate-300">
            Airo-generated storefront and marketing site, moved into GitHub with the same project structure.
          </p>
        </div>
      </main>
    </ContentListContext.Provider>
  );
}
