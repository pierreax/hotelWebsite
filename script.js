let accessToken, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, destination;

async function getAccessToken() {
    const tokenResponse = await fetch('/api/getAccessToken');
    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;
}

$(document).ready(async function() {

    // ------- STEP 0 Load Page and Initialize ----------

    const queryParams = new URLSearchParams(window.location.search);
    $('#email').val(queryParams.get('email'));
    $('#currency').val(queryParams.get('currency')).trigger('change');
    $('#destination').val(queryParams.get('city'));


    const resultsContainer = $('#resultsBox'); // Assuming this is where you want to append the results

    // Function to display the flight tracking modal
    function askForFlightTracking() {
        console.log('Displaying flight tracking modal.');
        $('#flightTrackingModal').modal('show');
    }


    // Initialize Flatpickr for date range selection
    const datePicker = flatpickr('.datepicker', {
        mode: "range",
        dateFormat: "j M Y", // Format for display (e.g., "24 Jan 2024")
        altInput: true,
        altFormat: "j M Y", // Display format for the user
        minDate: 'today',
        locale: {
            firstDayOfWeek: 1 // Set Monday as the first day of the week
        },
        onChange: function(selectedDates, dateStr, instance) {
            // Trigger input event for further processing
            instance.element.dispatchEvent(new Event('input'));
        }
    });

    // Currencies and City based on IP-location
    $.get('https://api.ipgeolocation.io/ipgeo?apiKey=420e90eecc6c4bb285f238f38aea898f', function(response) {
        currency = response.currency.code;
        console.log('Setting currency to:',currency);
        // Update the currency based on the IP-response
        $('#currency').val(currency).trigger('change');
    });

    
    // Check for dateFrom and dateTo in the URL and set them in Flatpickr
    if (queryParams.dateFrom && queryParams.dateTo) {
        const dateFrom = queryParams.dateFrom;
        const dateTo = queryParams.dateTo;

        // Set Flatpickr dates if both dateFrom and dateTo are available
        datePicker.setDate([dateFrom, dateTo], true, "d/m/Y");
    }

    // Function to format Date to Local date
    function formatDateToLocalISOString(date) {
        if (!date) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().split('T')[0];
    }

    // ---------- Step 2 Utility Functions ---------------

    // Function to convert currency
    async function convertCurrency(amount, fromCurrency, toCurrency) {
        console.log('Converting from currency: ', fromCurrency, ' to currency: ', toCurrency);
        const url = `https://v6.exchangerate-api.com/v6/0fdee0a5645b6916b5a20bb3/latest/${fromCurrency}`;
        const response = await fetch(url);
        const data = await response.json();
        const rate = data.conversion_rates[toCurrency];
        if (!rate) {
            $('#noResultsMessage').show();
            throw new Error(`No conversion rate available for ${toCurrency}`);
        }
        return amount * rate;
    }

    async function getLocationCoordinates(destination) {
        console.log('Getting coordinates for destination: ', destination);
        const apiUrl = `/api/getCoordinatesByLocation?location=${encodeURIComponent(destination)}`;
    
        try {
            const response = await fetch(apiUrl);
            
            // Check if the response status is OK
            if (!response.ok) {
                throw new Error(`Error: ${response.statusText}`);
            }
    
            const data = await response.json();    
            console.log('Coordinates from destination:', data);
            return data;
        } catch (error) {
            console.error('Error fetching coordinates:', error.message);
            // Handle the error gracefully on the front-end
            alert('Failed to fetch coordinates. Please try again later.');
            throw error; // Rethrow or handle as necessary
        }
    }
    

    // --------- Step 3 Hotel APIs in order ------------
    

    // 3.1 Fetch hotels by coordinates
    async function fetchHotelsByCoordinates(lat, lng) {
        console.log(lat, lng);
        const apiUrl = `/api/getHotelsByCoordinates?latitude=${lat}&longitude=${lng}&radius=10&radiusUnit=KM&hotelSource=ALL`;
        const response = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const hotelsData = await response.json();
        return hotelsData.data;
    }    



    // 3.2 Fetch Hotel Offers
    async function fetchHotelOffers(hotelIds) {
        const limitedHotelIds = hotelIds.slice(0, 20);
        const params = new URLSearchParams({
            hotelIds: limitedHotelIds,
            adults: adults,
            checkInDate: checkInDate, // Use the global variable directly
            checkOutDate: checkOutDate, // Use the global variable directly
            roomQuantity: numberOfRooms,
            paymentPolicy: 'NONE',
            bestRateOnly: true,
            includeClosed: false
        });
    
        // Use the new backend URL for fetching hotel offers
        const url = `/api/getHotelOffers?${params.toString()}`;
        console.log('Fetching hotel offers with params:', params.toString());
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
    
            const text = await response.text();
    
            try {
                const responseData = JSON.parse(text);
                console.log('Hotel offers response:', responseData.data);
    
                if (responseData.message) { // Check for the message
                    resultsContainer.html(`<div class="no-results-message">${responseData.message}</div>`);
                    return; // Exit if there are no valid offers
                }
    
                if (responseData.errors) {
                    const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                    throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                }
    
                return responseData.data; // Return valid offers
    
            } catch (err) {
                throw new Error(`Failed to parse hotel offers response: ${text}`);
            }
    
        } catch (error) {
            console.error('Error fetching hotel offers:', error.message);
            throw error;
        }
    }
       
    // 3.2B Convert Hotel Offers to Form Currency 
    async function convertPricesToFormCurrency(hotelOffers) {
        return Promise.all(hotelOffers.map(async offer => {
            const hotelName = offer.hotel.name; // Get the hotel name
            const originalCurrency = offer.offers[0].price.currency; // Check each offer's currency individually
            const price = parseFloat(offer.offers[0].price.total);
            
            // Log the hotel name and original currency for tracking
            console.log(`Checking hotel: ${hotelName}, Original currency: ${originalCurrency}, Price: ${price}`);
    
            if (originalCurrency !== formCurrency) {
                const convertedPrice = await convertCurrency(price, originalCurrency, formCurrency);
                offer.offers[0].price.total = Math.round(convertedPrice); // Round to nearest whole number
                console.log(`Converted price for ${hotelName} to ${formCurrency}: ${Math.round(convertedPrice)}`);
            } else {
                offer.offers[0].price.total = Math.round(price); // Round to nearest whole number if already in formCurrency
                console.log(`No conversion needed for ${hotelName}, Price: ${Math.round(price)}`);
            }
    
            return offer;
        }));
    }

    // 3.3 Fetch Hotel Ratings for Hotel IDs
    async function fetchHotelRatings(hotelOffers) {
        const hotelIds = hotelOffers.map(offer => offer.hotel.hotelId);
        const chunkSize = 3;
        console.log('Searching for ratings for: ',hotelIds);

        // Helper function to split hotelIds into chunks of size 3
        function chunkArray(array, size) {
            const result = [];
            for (let i = 0; i < array.length; i += size) {
                result.push(array.slice(i, i + size));
            }
            return result;
        }

        const hotelChunks = chunkArray(hotelIds, chunkSize);
        console.log('Hotel Chunks:', hotelChunks);

        const updatedOffers = [...hotelOffers]; // Create a copy to add ratings

        // Fetch ratings for each chunk
        for (const chunk of hotelChunks) {
            try {
                // Send request to fetch ratings for the current chunk
                const response = await fetch('/api/getHotelRatings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ hotelIds: chunk })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Error fetching hotel ratings: ${errorText}`);
                }

                const ratingsData = await response.json();
                console.log('Ratings Data for Chunk:', chunk, ratingsData);

                // Add ratings to the corresponding hotels in updatedOffers
                ratingsData.forEach(rating => {
                    const hotel = updatedOffers.find(h => h.hotelId === rating.hotelId);
                    if (hotel) {
                        hotel.rating = rating.overallRating || 'N/A'; // Add rating
                    }
                });
            } catch (error) {
                console.error(`Error fetching ratings for chunk ${chunk}:`, error.message);
            }
        }

        return updatedOffers; // Return the updated offers with ratings
    }


    // 3.4 Merge Ratings with Offers
    function mergeRatingsWithOffers(hotelOffers, hotelRatings) {
        const ratingsMap = new Map(hotelRatings.map(rating => [rating.hotelId, rating.overallRating]));
    
        return hotelOffers.map(offer => ({
            ...offer,
            rating: ratingsMap.get(offer.hotelId) || 'N/A' // Default to 'N/A' if no rating found
        }));
    }

    // 3.5 Display Results
    function displayHotelResults(hotelOffers) {
        $('#resultsBox').empty(); // Clear any previous results

        if (hotelOffers.length === 0) {
            $('#noResultsMessage').show();
            $('#resultsBox').hide(); // Hide the results box if no offers
            return;
        }

        $('#resultsBox').show(); // Ensure the results box is visible

        hotelOffers.forEach(offer => {
            // Preprocess the data with the formatting functions
            const formattedHotelName = formatHotelName(offer.hotel.name || 'Unknown Hotel');
            const formattedRoomType = formatRoomType(offer.offers?.[0]?.room?.typeEstimated.category || 'N/A');
            const formattedDistance = offer.distance !== 'N/A' 
                ? calculateDistance(offer.hotel.latitude, offer.hotel.longitude, locationCoordinates.lat, locationCoordinates.lng) 
                : 'N/A'; // Replace `destinationLatitude` and `destinationLongitude` with actual values if available

            // Create the card with the formatted data
            const card = createHotelCard({
                hotelId: offer.hotel.hotelId,
                hotelName: formattedHotelName,
                roomType: formattedRoomType,
                distance: formattedDistance,
                pricePerNight: offer.offers?.[0]?.price?.total || 'N/A',
                totalPrice: offer.offers?.reduce((sum, current) => sum + parseFloat(current.price.total || 0), 0) || 'N/A',
                rating: 'N/A', // Skip rating for now
            });

            console.log('Created a card for: ', offer.hotel.hotelId);

            $('#resultsBox').append(card);
        });
    }

    
    
    
    

    // 3.5b Create Card with Hotel information
    function createHotelCard(result) {
        const card = $('<div>').addClass('card');
    
        // Add hidden hotelId element
        const hiddenHotelId = $('<div>').addClass('hiddenHotelId').text(result.hotelId).hide();
        card.append(hiddenHotelId);
    
        // Card Header with hotel name
        const cardHeader = $('<div>').addClass('card-header');
        cardHeader.append($('<div>').text(result.hotelName).addClass('hotel-name'));
        card.append(cardHeader);
    
        // Add room type below hotel name
        const roomType = $('<div>').text(result.roomType).addClass('room-type');
        card.append(roomType);
    
        // Add the distance in a separate container
        const distanceContainer = $('<div>').addClass('distance').text(`${result.distance} km`);
        card.append(distanceContainer);
    
        // Add Price per Night
        const pricePerNightDiv = $('<div>').addClass('price-per-night');
        pricePerNightDiv.append($('<span>').addClass('label').text('Per Night: '));
        pricePerNightDiv.append($('<span>').addClass('amount').text(`${result.pricePerNight}`));
        card.append(pricePerNightDiv);
    
        // Add Total Price
        const totalPriceDiv = $('<div>').addClass('total-price');
        totalPriceDiv.append($('<span>').addClass('label').text('Total: '));
        totalPriceDiv.append($('<span>').addClass('amount').text(`${result.totalPrice}`));
        card.append(totalPriceDiv);
    
        // Add Rating if available
        const ratingDiv = $('<div>').addClass('rating');
        ratingDiv.append($('<span>').addClass('label').text('Rating: '));
        ratingDiv.append($('<span>').addClass('rating-value').text(result.rating));
        card.append(ratingDiv);
    
        // Create a container for the checkbox and its label
        const checkboxContainer = $('<div>').addClass('checkbox-container');
        checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to Robot: '));
        checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));
        card.append(checkboxContainer);
    
        return card;
    }
    

    

    // -------- Step 4 Search Form Submission -----------
    

    $('#searchForm').on('submit', async function(event) {
        event.preventDefault();  // Prevent default form submission behavior
        resetUIForSubmission();  // Reset the UI before starting the submission
    
        // Step 4.1 Retrieve form data and validate
        const { destination, checkInDate, checkOutDate, adults, numberOfRooms, email, limitResults, formCurrency, numberOfNights } = getFormData();
        if (!checkInDate || !checkOutDate || numberOfNights <= 0) {
            alert('Please enter valid check-in and check-out dates.');
            $('.datepicker').focus();
            hideLoading();
            return;
        }
    

        // -------------- LOGIC when the Search button is pressed -----------------------

        console.log('Form Data:', { destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency });
    
        try {
            console.log('Search button is pressed!');
            // 0. Get the Access Token for Amadeus
            await getAccessToken(); // Await the access token

            // 1. Get the location coordinates
            const locationCoordinates = await getLocationCoordinates(destination);

            // 2. Fetch hotels by coordinates
            const hotelsData = await fetchHotelsByCoordinates(locationCoordinates.lat, locationCoordinates.lng);
            

            // 3. Extract valid hotel IDs from hotelsData
            const hotelIds = hotelsData.map(hotel => hotel.hotelId);

            // 4. Fetch hotel offers using the valid hotel IDs
            const hotelOffers = await fetchHotelOffers(hotelIds);

            // 5. Fetch ratings for the hotels
           // console.log('Searching ratings for hotels:', hotelOffers);
            //const hotelRatings = await fetchHotelRatings(hotelOffers);

            // 5b. Merge ratings with hotel offers
            //const combinedResults = mergeRatingsWithOffers(hotelOffers, hotelRatings);
            //console.log('Combined Results with Ratings:', combinedResults);
    
            // 7. Process aggregated results (you can show them in the UI)
            console.log('Creating cards for :', hotelIds);
            displayHotelResults(hotelOffers);
    
        } catch (error) {
            console.error('Error during form submission:', error.message);
            $('#noResultsMessage').show();
        } finally {
            $('.loader').hide();
        }
    });
    
    // Reset the UI for a new submission (hide results, etc.)
    function resetUIForSubmission() {
        $('#noResultsMessage').hide();
        $('#submitText').hide();
        $('.loader').show();
    }
    
    // Get form data and validate check-in/check-out dates
    function getFormData() {
        destination = $('#destination').val();  // Assign directly to global variable
        const dateRange = datePicker.selectedDates;
        adults = $('#adults').val();
        numberOfRooms = $('#numberOfRooms').val();
        email = $('#email').val();
        formCurrency = $('#currency').val();
        
        checkInDate = formatDateToLocalISOString(dateRange[0]);
        checkOutDate = formatDateToLocalISOString(dateRange[1]);
        const numberOfNights = dateRange[1] && dateRange[0] ? Math.round((dateRange[1] - dateRange[0]) / (1000 * 60 * 60 * 24)) : 0;
        
        return { destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, numberOfNights };
    }
    
    
        
    // --------Submit to Sheety --------------
    async function submitToSheety(formData, formattedData) {
        const data = {
            location: formData.destination,
            checkInDate: formData.checkInDate,
            checkOutDate: formData.checkOutDate,
            adults: formData.adults,
            numberOfRooms: formData.numberOfRooms,
            email: formData.email,
            currency: formData.currency,
            selectedHotels: formattedData.selectedHotels.length > 0 ? formattedData.selectedHotels : [{ message: "No hotels selected" }]
        };
    
        console.log('Submitting to Sheety with data:', JSON.stringify(data, null, 2));
        
        try {
            // Use the new backend URL for submitting data
            const response = await fetch('/api/sendDataToSheety', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            // Check for non-JSON responses and handle accordingly
            const text = await response.text();
            if (response.ok) {
                console.log('Sheety response:', text);
                return JSON.parse(text);
            } else {
                throw new Error(`HTTP error ${response.status}: ${text}`);
            }
        } catch (error) {
            console.error('Error sending data to Sheety:', error.message);
            throw error;
        } finally {
            // Hide the loading icon
            $('.loader').hide();
        }
    }
    
    // ---------- Card Functionality -------------

    // Function to handle checkbox change
    function handleCheckboxChange() {
        console.log('Checkbox changed');
    
        // Get all checked checkboxes
        const checkedCheckboxes = $('#resultsBox .card input[type="checkbox"]:checked');
        console.log('Checked checkboxes:', checkedCheckboxes.length);
    
        // Toggle the submit button visibility based on whether any checkboxes are checked
        $('#submitToSheet').toggle(checkedCheckboxes.length > 0);
    
        // Extract and log information from each selected card
        selectedHotels = checkedCheckboxes.map(function() {
            const card = $(this).closest('.card');
            const hotelId = card.find('.hiddenHotelId').text();
            const hotelName = card.find('.hotel-name').text();
            const roomType = card.find('.room-type').text();
            const pricePerNight = card.find('.price-per-night .amount').text();
            const totalPrice = card.find('.total-price .amount').text();
    
            // Log the extracted information
            console.log('Selected Hotel Info:', {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice
            });
    
            // Return the data to be stored in selectedHotels array
            return {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice
            };
        }).get();
    }

    // Format Hotel Names
    function formatHotelName(hotelName) {
        if (typeof hotelName !== 'string') return 'N/A';
        return hotelName
            .toUpperCase()
            .replace(/_/g, ' ') // Replace underscores with spaces
            .replace(/,/g, '') // Remove commas
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
        
    // Format Hotel Room Types
    function formatRoomType(roomType) {
        if (typeof roomType !== 'string') return 'N/A';
        return roomType
            .toUpperCase()
            .replace(/_/g, ' ')
            .replace(/,/g, '') // Remove commas
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    // Format Hotel Distances
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance.toFixed(2); // Distance in km
    }

    // ------- SUBMIT to Sheety BUTTON -------  
    $('#submitToSheet').off('click').on('click', async function() {
        console.log('Submitting data to SHEETY');
        
        // Show the loader before starting the submission
        $('.loader').show();
        
        const formData = {
            destination,
            checkInDate,
            checkOutDate,
            adults,
            numberOfRooms,
            email,
            currency: formCurrency,
        };
        
        const formattedData = {
            selectedHotels
        };
        
        // ------- LOGIC when the Submit button is pressed
        try {
            // Submit to Sheety
            const sheetyResult = await submitToSheety(formData, formattedData);
            
            // Check for confirmation by verifying the presence of "id" in the response
            if (sheetyResult && sheetyResult.price && sheetyResult.price.id) {
                console.log('Data successfully submitted to Sheety:', sheetyResult);
            } else {
                console.warn('Data submitted to Sheety but did not receive a success confirmation:', sheetyResult);
            }

            // Send email via the backend
            await sendEmail(desintation, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, formattedData.selectedHotels);
    
            // Show modal to ask if the user wants to track flights
            askForFlightTracking();
            
            // Event listener for "Yes" button in the modal to confirm flight tracking
            $('#confirmFlightTracker').on('click', function() {
                console.log("User opted to track flights.");
                const redirectUrl = 'https://www.robotize.no/flights';
                window.location.href = redirectUrl;
            });
    
            // Optional: Handle "No" button in the modal
            $('.btn-secondary').on('click', function() {
                console.log("User declined flight tracking.");
                // Reload the page after submission
                window.location.reload();
            });            
    
            
        } catch (error) {
            console.error('Error during form submission:', error.message);
        } finally {
            // Hide the loading icon after the submission completes
            $('.loader').hide();
        }
    });
          
    function toggleCheckbox(event) {
        event.stopPropagation(); // Prevents the click event from bubbling up
        const checkbox = $(this).find('input[type="checkbox"]');
        checkbox.prop('checked', !checkbox.prop('checked')).trigger('change'); // Toggle checkbox state and trigger change
        handleCheckboxChange();
    }
        
    // Attach event listener to the checkbox-container
    $('#resultsBox').on('click', '.checkbox-container', toggleCheckbox);

    // Attach event listener to all existing checkboxes
    $('#resultsBox').on('click', '.select-checkbox', toggleCheckbox);


    // FINAL STEP Function to send email after submission
    async function sendEmail(destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, selectedHotels) {
        try {
            const emailResponse = await fetch('/api/SendMail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subject: "New submission for your Hotel Robot",
                    body: `Great news, somebody just signed up for your Hotel Robot! Here are the details:<br><br>
                        Destination: ${destination}<br>
                        Check-In Date: ${checkInDate}<br>
                        Check-Out Date: ${checkOutDate}<br>
                        Adults: ${adults}<br>
                        Number of Rooms: ${numberOfRooms}<br>
                        Email: ${email}<br>
                        Currency: ${formCurrency}<br>
                        Selected Hotels:<br>
                        ${selectedHotels.length > 0 
                            ? selectedHotels.map(hotel => 
                                `- ${hotel.hotelName}<br>`
                            ).join('') 
                            : 'No hotels selected'}<br><br>
                        Thank you!`,
                    recipient_email: email
                })
            });

            if (!emailResponse.ok) {
                console.error('Failed to send email.');
            }
        } catch (emailError) {
            console.error('Error during email sending:', emailError.message);
        }
    }

});
