import React, { useState, useRef } from "react";
import { useFireproof } from "use-fireproof";
import { callAi, imageGen } from "call-ai";

export default function App() {
  const { useDocument, useLiveQuery, database } = useFireproof("social-profile-cards");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [activeTab, setActiveTab] = useState("create");
  const [generatedImage, setGeneratedImage] = useState(null);
  const fileInputRef = useRef(null);

  const { doc, merge, save } = useDocument({
    name: "",
    bio: "",
    handle: "",
    platform: "Instagram",
    connections: 0,
    imageUrl: "",
    createdAt: Date.now(),
  });

  const { docs: profiles } = useLiveQuery("createdAt", { descending: true });
  
  const platforms = [
    "Instagram", 
    "Twitter", 
    "TikTok", 
    "LinkedIn", 
    "YouTube", 
    "Discord", 
    "Twitch",
    "Pinterest",
    "Reddit"
  ];

  const handleInputChange = (e) => {
    merge({ [e.target.name]: e.target.value });
  };

  const handleNumberInput = (e) => {
    merge({ [e.target.name]: parseInt(e.target.value) || 0 });
  };

  const generateProfileImage = async () => {
    try {
      setIsGenerating(true);
      
      if (!imagePrompt.trim()) {
        alert("Please enter an image description");
        setIsGenerating(false);
        return;
      }

      // Format the prompt to get a good profile picture
      const formattedPrompt = `Create a stylish profile picture for a ${doc.platform} profile with this description: ${imagePrompt}. Make it look professional and appropriate for social media.`;
      
      const response = await imageGen(formattedPrompt, { 
        size: "1024x1024",
        quality: "hd"
      });
      
      const imageBase64 = response.data[0].b64_json;
      setGeneratedImage(`data:image/png;base64,${imageBase64}`);
      merge({ imageUrl: `data:image/png;base64,${imageBase64}` });
    } catch (error) {
      console.error("Image generation failed:", error);
      alert("Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateBio = async () => {
    try {
      if (!doc.name || !doc.platform) {
        alert("Please enter a name and select a platform");
        return;
      }

      const prompt = `Write a short, engaging bio (maximum 100 characters) for a ${doc.platform} profile for someone named ${doc.name} who is interested in social media and creativity.`;
      
      const response = await callAi(prompt, {
        schema: {
          properties: {
            bio: { type: "string" }
          }
        }
      });
      
      const data = JSON.parse(response);
      merge({ bio: data.bio });
    } catch (error) {
      console.error("Bio generation failed:", error);
      alert("Failed to generate bio. Please try again.");
    }
  };

  const handleSaveProfile = async () => {
    if (!doc.name || !doc.handle || !doc.bio) {
      alert("Please fill in name, handle, and bio");
      return;
    }
    
    if (!doc.imageUrl) {
      alert("Please generate or upload a profile image");
      return;
    }
    
    await save();
    
    // Reset the form and image
    merge({
      name: "",
      bio: "",
      handle: "",
      platform: "Instagram",
      connections: 0,
      imageUrl: "",
      createdAt: Date.now()
    });
    
    setGeneratedImage(null);
    setImagePrompt("");
    setActiveTab("view");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target.result;
      setGeneratedImage(imageUrl);
      merge({ imageUrl });
    };
    reader.readAsDataURL(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const handleDeleteProfile = async (profileId) => {
    if (window.confirm("Are you sure you want to delete this profile?")) {
      await database.del(profileId);
    }
  };

  const generateDemoData = async () => {
    try {
      const prompt = "Generate 4 sample creative profiles with names, handles, bios, and connection counts for these social media platforms: Instagram, Twitter, TikTok, and LinkedIn";
      
      const response = await callAi(prompt, {
        schema: {
          properties: {
            profiles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  handle: { type: "string" },
                  bio: { type: "string" },
                  platform: { type: "string" },
                  connections: { type: "integer" }
                }
              }
            }
          }
        }
      });
      
      const data = JSON.parse(response);
      
      for (const profile of data.profiles) {
        // Generate a placeholder image for each profile
        const imgPrompt = `Create a stylish profile picture for ${profile.name} on ${profile.platform}`;
        const imgResponse = await imageGen(imgPrompt, { size: "1024x1024" });
        
        await database.put({
          ...profile,
          imageUrl: `data:image/png;base64,${imgResponse.data[0].b64_json}`,
          createdAt: Date.now() - Math.floor(Math.random() * 1000000)
        });
      }
      
      setActiveTab("view");
    } catch (error) {
      console.error("Demo data generation failed:", error);
      alert("Failed to generate demo data");
    }
  };

  return (
    <div className="min-h-screen p-6 bg-[#ffffff] bg-opacity-90 bg-[url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"><circle cx=\"20\" cy=\"20\" r=\"5\" fill=\"%2370d6ff\" /><circle cx=\"50\" cy=\"30\" r=\"4\" fill=\"%23ff70a6\" /><circle cx=\"80\" cy=\"20\" r=\"6\" fill=\"%23ff9770\" /><circle cx=\"10\" cy=\"50\" r=\"7\" fill=\"%23ffd670\" /><circle cx=\"40\" cy=\"70\" r=\"5\" fill=\"%23e9ff70\" /><circle cx=\"70\" cy=\"50\" r=\"4\" fill=\"%23ff70a6\" /><circle cx=\"90\" cy=\"80\" r=\"6\" fill=\"%2370d6ff\" /></svg>')]">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-4 text-[#242424] text-center">Social Profile Card Generator</h1>
        
        <div className="mb-8 p-4 bg-[#ffffff] rounded-lg border-4 border-[#242424] shadow-lg">
          <p className="italic text-center text-[#242424]">
            Create custom social media profile cards for different platforms with AI-generated profile pictures. 
            Design your perfect online persona for Instagram, Twitter, TikTok and more! Simply enter your details, 
            generate a profile image, and save your card to your collection.
          </p>
        </div>
        
        <div className="flex mb-6 bg-[#ffffff] rounded-lg border-4 border-[#242424] overflow-hidden">
          <button 
            className={`flex-1 py-3 px-6 font-bold ${activeTab === 'create' ? 'bg-[#ff70a6] text-white' : 'bg-[#ffffff] text-[#242424]'}`}
            onClick={() => setActiveTab('create')}
          >
            Create Profile
          </button>
          <button 
            className={`flex-1 py-3 px-6 font-bold ${activeTab === 'view' ? 'bg-[#70d6ff] text-white' : 'bg-[#ffffff] text-[#242424]'}`}
            onClick={() => setActiveTab('view')}
          >
            View Profiles ({profiles.length})
          </button>
        </div>
        
        {activeTab === 'create' && (
          <div className="bg-[#ffffff] p-6 rounded-lg border-4 border-[#242424] shadow-lg mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-4 text-[#242424]">Profile Details</h2>
                
                <div className="mb-4">
                  <label className="block font-bold mb-2 text-[#242424]">Platform</label>
                  <select 
                    name="platform" 
                    value={doc.platform} 
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 rounded border-2 border-[#242424]"
                  >
                    {platforms.map(platform => (
                      <option key={platform} value={platform}>{platform}</option>
                    ))}
                  </select>
                </div>
                
                <div className="mb-4">
                  <label className="block font-bold mb-2 text-[#242424]">Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={doc.name} 
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 rounded border-2 border-[#242424]"
                    placeholder="Your name"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block font-bold mb-2 text-[#242424]">Handle</label>
                  <div className="flex items-center">
                    <span className="text-lg font-bold px-3">@</span>
                    <input 
                      type="text" 
                      name="handle" 
                      value={doc.handle} 
                      onChange={handleInputChange}
                      className="flex-1 px-4 py-2 rounded border-2 border-[#242424]"
                      placeholder="your_handle"
                    />
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block font-bold text-[#242424]">Bio</label>
                    <button
                      onClick={generateBio}
                      className="px-3 py-1 bg-[#ffd670] text-[#242424] rounded-lg border-2 border-[#242424] font-bold text-sm hover:bg-[#e9ff70]"
                    >
                      Generate Bio
                    </button>
                  </div>
                  <textarea 
                    name="bio" 
                    value={doc.bio} 
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 rounded border-2 border-[#242424]"
                    rows="3"
                    placeholder="Tell the world about yourself"
                  />
                  <div className="text-right text-sm mt-1">
                    <span className={doc.bio.length > 100 ? "text-red-500" : "text-gray-500"}>
                      {doc.bio.length}/100
                    </span>
                  </div>
                </div>
                
                <div className="mb-4">
                  <label className="block font-bold mb-2 text-[#242424]">Connections</label>
                  <input 
                    type="number" 
                    name="connections" 
                    value={doc.connections} 
                    onChange={handleNumberInput}
                    className="w-full px-4 py-2 rounded border-2 border-[#242424]"
                    placeholder="Number of followers/connections"
                    min="0"
                  />
                </div>
              </div>
              
              <div>
                <h2 className="text-2xl font-bold mb-4 text-[#242424]">Profile Image</h2>
                
                <div className="mb-4">
                  <label className="block font-bold mb-2 text-[#242424]">Image Description</label>
                  <textarea 
                    value={imagePrompt} 
                    onChange={(e) => setImagePrompt(e.target.value)}
                    className="w-full px-4 py-2 rounded border-2 border-[#242424]"
                    rows="3"
                    placeholder="Describe what you want in your profile picture..."
                  />
                </div>
                
                <div className="flex space-x-2 mb-4">
                  <button
                    onClick={generateProfileImage}
                    className="flex-1 py-2 px-4 bg-[#ff9770] text-white rounded-lg border-2 border-[#242424] font-bold hover:bg-[#ff70a6] disabled:opacity-50"
                    disabled={isGenerating || !imagePrompt.trim()}
                  >
                    {isGenerating ? "Generating..." : "Generate Image"}
                  </button>
                  
                  <button
                    onClick={triggerFileInput}
                    className="py-2 px-4 bg-[#70d6ff] text-white rounded-lg border-2 border-[#242424] font-bold hover:bg-[#70d6ff] flex-1"
                  >
                    Upload Image
                  </button>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                
                <div className="mb-4 flex justify-center">
                  {(generatedImage || doc.imageUrl) ? (
                    <div className="border-4 border-[#242424] rounded-full overflow-hidden w-48 h-48">
                      <img
                        src={generatedImage || doc.imageUrl}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="border-4 border-[#242424] rounded-full overflow-hidden w-48 h-48 bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500 text-lg">No Image</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-center mt-6">
              <button
                onClick={handleSaveProfile}
                className="py-3 px-8 bg-[#ff70a6] text-white rounded-lg border-3 border-[#242424] font-bold text-xl hover:bg-[#ff9770] transition-colors"
              >
                Save Profile Card
              </button>
            </div>
            
            <div className="flex justify-center mt-4">
              <button
                onClick={generateDemoData}
                className="py-2 px-4 bg-[#e9ff70] text-[#242424] rounded-lg border-2 border-[#242424] font-bold hover:bg-[#ffd670]"
              >
                Demo Data
              </button>
            </div>
          </div>
        )}
        
        {activeTab === 'view' && (
          <div className="bg-[#ffffff] p-6 rounded-lg border-4 border-[#242424] shadow-lg mb-6">
            <h2 className="text-2xl font-bold mb-6 text-[#242424]">Your Profile Cards</h2>
            
            {profiles.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-500 mb-4">You haven't created any profile cards yet.</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="py-2 px-6 bg-[#ff70a6] text-white rounded-lg border-2 border-[#242424] font-bold hover:bg-[#ff9770]"
                >
                  Create Your First Profile
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map(profile => (
                  <div key={profile._id} className="bg-white rounded-lg border-3 border-[#242424] shadow-lg overflow-hidden relative">
                    <div className={`h-4 ${
                      profile.platform === "Instagram" ? "bg-gradient-to-r from-purple-600 to-pink-500" :
                      profile.platform === "Twitter" ? "bg-[#1DA1F2]" :
                      profile.platform === "TikTok" ? "bg-gradient-to-r from-[#ff0050] to-[#00f2ea]" :
                      profile.platform === "LinkedIn" ? "bg-[#0077B5]" :
                      profile.platform === "YouTube" ? "bg-[#FF0000]" :
                      profile.platform === "Discord" ? "bg-[#5865F2]" :
                      profile.platform === "Twitch" ? "bg-[#6441A4]" :
                      profile.platform === "Pinterest" ? "bg-[#E60023]" :
                      profile.platform === "Reddit" ? "bg-[#FF4500]" :
                      "bg-[#70d6ff]"
                    }`}></div>
                    
                    <div className="p-4">
                      <div className="flex items-center mb-3">
                        <div className="border-3 border-[#242424] rounded-full overflow-hidden w-16 h-16 mr-3">
                          <img
                            src={profile.imageUrl}
                            alt={profile.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-[#242424]">{profile.name}</h3>
                          <p className="text-[#666666]">@{profile.handle}</p>
                        </div>
                        <div className="ml-auto">
                          <span className="text-xs font-bold bg-[#ffd670] text-[#242424] py-1 px-2 rounded-full border border-[#242424]">
                            {profile.platform}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm mb-3 text-[#242424]">{profile.bio}</p>
                      
                      <div className="flex justify-between items-center">
                        <div className="text-sm">
                          <span className="font-bold text-[#242424]">{profile.connections.toLocaleString()}</span>
                          <span className="text-gray-500 ml-1">
                            {profile.platform === "Instagram" || profile.platform === "TikTok" || profile.platform === "YouTube" || profile.platform === "Twitch" ? "followers" :
                             profile.platform === "Twitter" ? "followers" :
                             profile.platform === "LinkedIn" ? "connections" :
                             profile.platform === "Pinterest" ? "followers" :
                             profile.platform === "Reddit" ? "karma" :
                             profile.platform === "Discord" ? "friends" :
                             "followers"}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => handleDeleteProfile(profile._id)}
                          className="text-sm py-1 px-3 bg-white text-red-500 rounded border border-red-500 hover:bg-red-500 hover:text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}